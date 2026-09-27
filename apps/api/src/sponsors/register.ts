import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';

/**
 * Home Office "Register of licensed sponsors: workers". Published by gov.uk as a CSV
 * that is replaced regularly; the publication page links to the current file.
 */
export const REGISTER_PAGE = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';

const SUFFIXES = /\b(ltd|limited|plc|llp|lp|inc|incorporated|co|company|corporation|corp|group|holdings|uk|u k|gb|international|services|the)\b/g;

/** Canonical company name used for matching adverts against the register. */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export interface RegisterRow {
  organisationName: string;
  normalizedName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  route: string | null;
}

/** Turn the register CSV into rows. Keeps Skilled Worker entries; "X t/a Y" yields both names. */
export function registerRowsFromCsv(csv: string): RegisterRow[] {
  const [header, ...data] = parseCsv(csv.replace(/^﻿/, ''));
  if (!header) throw new Error('Empty CSV');
  const col = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const iName = col(/organisation name/i);
  const iTown = col(/town|city/i);
  const iCounty = col(/county/i);
  const iType = col(/type|rating/i);
  const iRoute = col(/route/i);
  if (iName < 0) throw new Error('CSV does not look like the sponsor register (no "Organisation Name" column)');
  const out: RegisterRow[] = [];
  for (const r of data) {
    const route = iRoute >= 0 ? r[iRoute]?.trim() || null : null;
    if (route && !/skilled worker/i.test(route)) continue;
    const name = r[iName]?.trim();
    if (!name) continue;
    const base = { townCity: r[iTown]?.trim() || null, county: iCounty >= 0 ? r[iCounty]?.trim() || null : null, typeRating: iType >= 0 ? r[iType]?.trim() || null : null, route };
    const names = name.split(/\s+(?:t\/a|trading as)\s+/i).map((n) => n.trim()).filter(Boolean);
    for (const n of names) {
      const normalizedName = normalizeCompany(n);
      if (normalizedName) out.push({ organisationName: name, normalizedName, ...base });
    }
  }
  return out;
}

export async function importRegisterCsv(csv: string, sourceUrl: string | null) {
  const rows = registerRowsFromCsv(csv);
  if (rows.length < 10) throw new Error(`Only ${rows.length} Skilled Worker rows found — refusing to replace the register`);
  await prisma.$transaction(async (tx) => {
    await tx.sponsorRegister.deleteMany();
    for (let i = 0; i < rows.length; i += 5000) await tx.sponsorRegister.createMany({ data: rows.slice(i, i + 5000) });
    await tx.sponsorRegisterMeta.upsert({ where: { id: 1 }, create: { id: 1, rows: rows.length, sourceUrl, importedAt: new Date() }, update: { rows: rows.length, sourceUrl, importedAt: new Date(), lastError: null } });
  }, { timeout: 120_000 });
  await audit('SETTINGS_CHANGED', `Sponsor register imported: ${rows.length} Skilled Worker entries`, { data: { sourceUrl } });
  return rows.length;
}

/** Download the current register from gov.uk (runs on the user's machine). */
export async function refreshRegisterFromGovUk() {
  try {
    const page = await fetch(REGISTER_PAGE, { signal: AbortSignal.timeout(30_000) });
    if (!page.ok) throw new Error(`gov.uk page responded ${page.status}`);
    const html = await page.text();
    const link = html.match(/href="(https:\/\/assets\.publishing\.service\.gov\.uk\/[^"]+\.csv)"/i)?.[1];
    if (!link) throw new Error('Could not find the CSV link on the gov.uk page — upload the CSV manually in Settings');
    const csvRes = await fetch(link, { signal: AbortSignal.timeout(120_000) });
    if (!csvRes.ok) throw new Error(`CSV download responded ${csvRes.status}`);
    return await importRegisterCsv(await csvRes.text(), link);
  } catch (err) {
    const msg = (err as Error).message;
    await prisma.sponsorRegisterMeta.upsert({ where: { id: 1 }, create: { id: 1, lastError: msg }, update: { lastError: msg } });
    throw err;
  }
}

export async function registerStatus() {
  const meta = await prisma.sponsorRegisterMeta.findUnique({ where: { id: 1 } });
  return { loaded: Boolean(meta?.rows), rows: meta?.rows ?? 0, importedAt: meta?.importedAt ?? null, sourceUrl: meta?.sourceUrl ?? null, lastError: meta?.lastError ?? null };
}

/**
 * Is this employer on the register? Returns null when the register hasn't been loaded,
 * so callers can tell "not a sponsor" apart from "don't know".
 * Exact normalized match first; then the advert's name as a whole-word prefix of a
 * register name ("Monzo" → "Monzo Bank"), which is flagged as a name match only.
 */
export async function lookupSponsor(company: string): Promise<{ licensed: boolean; name: string | null } | null> {
  const status = await prisma.sponsorRegisterMeta.findUnique({ where: { id: 1 }, select: { rows: true } });
  if (!status?.rows) return null;
  const n = normalizeCompany(company);
  if (!n) return { licensed: false, name: null };
  const exact = await prisma.sponsorRegister.findFirst({ where: { normalizedName: n }, select: { organisationName: true } });
  if (exact) return { licensed: true, name: exact.organisationName };
  if (n.length >= 4) {
    const prefix = await prisma.sponsorRegister.findFirst({ where: { normalizedName: { startsWith: `${n} ` } }, select: { organisationName: true } });
    if (prefix) return { licensed: true, name: `${prefix.organisationName} (name match)` };
  }
  return { licensed: false, name: null };
}
