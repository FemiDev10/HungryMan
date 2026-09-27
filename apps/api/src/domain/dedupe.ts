import { normalize } from './text.js';

const COMPANY_SUFFIXES = /\b(ltd|limited|plc|llp|inc|group|uk|co|company|holdings)\b/g;
const TITLE_NOISE = /\b(m\/f|f\/m|immediate start|urgent|new|hiring now|\(.*?\))\b/g;

/** Cross-source dedupe key: same company + same title + same city ≈ same vacancy. */
export function dedupeKey(company: string, title: string, location?: string | null): string {
  const c = normalize(company).replace(COMPANY_SUFFIXES, '').replace(/\s+/g, ' ').trim();
  const t = normalize(title).replace(TITLE_NOISE, '').replace(/\s+/g, ' ').trim();
  const l = normalize((location ?? '').split(',')[0]).trim();
  return `${c}|${t}|${l}`;
}
