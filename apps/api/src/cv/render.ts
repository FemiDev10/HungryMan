import PDFDocument from 'pdfkit';
import type { CvContent, CvSentence } from '../domain/cvBuilder.js';

const fmtMonth = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** The built-in PDF fonts only cover Windows-1252; swap the few characters CVs use that fall outside it. */
function pdfSafe<T>(value: T): T {
  const map: Record<string, string> = { '\u2192': '->', '\u2190': '<-', '\u2264': '<=', '\u2265': '>=', '\u2713': '-', '\u2248': '~' };
  return JSON.parse(JSON.stringify(value).replace(/[\u2190\u2192\u2264\u2265\u2713\u2248]/g, (c) => map[c] ?? c));
}

/** Render structured CV content to a simple ATS-friendly single-column PDF. */
export async function renderCvPdf(input: CvContent): Promise<Buffer> {
  const cv = pdfSafe(input);
  const compact = cv.profile.template === 'compact';
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 42, bottom: 42, left: 48, right: 48 },
    info: { Title: `${cv.header.name} — CV`, Author: cv.header.name, Creator: 'HungryMan' },
  });
  const accent = '#1f3a5f';
  const body = compact ? 9.5 : 10;
  const width = doc.page.width - 96;

  doc.font('Helvetica-Bold').fontSize(compact ? 18 : 20).fillColor('#111').text(cv.header.name);
  if (cv.header.headline) doc.font('Helvetica').fontSize(11).fillColor(accent).text(cv.header.headline);
  const contact = [cv.header.location, cv.header.email, cv.header.phone, ...cv.header.links.map((l) => l.url)].filter(Boolean).join('  ·  ');
  doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#444').text(contact, { width });

  const section = (title: string) => {
    doc.moveDown(compact ? 0.5 : 0.8);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(accent).text(title.toUpperCase(), { characterSpacing: 0.6 });
    const y = doc.y + 1;
    doc.moveTo(48, y).lineTo(48 + width, y).lineWidth(0.5).strokeColor('#c9d2dc').stroke();
    doc.moveDown(0.3).fillColor('#111');
  };
  const bullet = (text: string) => {
    doc.font('Helvetica').fontSize(body).fillColor('#222').text(`•  ${text}`, { width, indent: 0, paragraphGap: 1.5 });
  };
  const para = (sentences: CvSentence[]) => doc.font('Helvetica').fontSize(body).fillColor('#222').text(sentences.map((s) => s.text).join(' '), { width, lineGap: 1 });

  if (cv.summary.length) {
    section(cv.profile.track === 'GENERAL' ? 'Profile' : 'Summary');
    para(cv.summary);
  }
  if (cv.strengths.length) {
    section('Key strengths');
    cv.strengths.forEach((s) => bullet(s.text));
  }
  if (cv.skillLines?.length) {
    section('Skills');
    for (const l of cv.skillLines) {
      const i = l.text.indexOf(':');
      if (i > 0 && i < 40) {
        doc.font('Helvetica-Bold').fontSize(body).fillColor('#111').text(`${l.text.slice(0, i + 1)} `, { width, continued: true });
        doc.font('Helvetica').fillColor('#222').text(l.text.slice(i + 1).trim(), { paragraphGap: 2 });
      } else doc.font('Helvetica').fontSize(body).fillColor('#222').text(l.text, { width, paragraphGap: 2 });
    }
  } else if (cv.skills.length) {
    section('Skills');
    doc.font('Helvetica').fontSize(body).fillColor('#222').text(cv.skills.map((s) => s.name).join('  ·  '), { width });
  }
  if (cv.experience.length) {
    section('Experience');
    for (const e of cv.experience) {
      const dates = e.datesText ?? `${fmtMonth(e.start)} – ${e.current ? 'Present' : fmtMonth(e.end)}`;
      const top = doc.y;
      doc.font('Helvetica-Bold').fontSize(body + 0.5).fillColor('#111').text(`${e.title}, ${e.employer}`, 48, top, { width: width - 130 });
      const afterTitle = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor('#555').text(dates, 48 + width - 130, top, { width: 130, align: 'right' });
      doc.x = 48;
      doc.y = Math.max(afterTitle, doc.y);
      if (e.location) doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555').text(e.location);
      e.bullets.forEach((b) => bullet(b.text));
      doc.moveDown(0.35);
    }
  }
  if (cv.projects.length) {
    section('Projects');
    for (const p of cv.projects) {
      doc.font('Helvetica-Bold').fontSize(body + 0.5).fillColor('#111').text(`${p.name}${p.role ? ` — ${p.role}` : ''}`);
      if (p.url) doc.font('Helvetica').fontSize(9).fillColor(accent).text(p.url);
      p.bullets.forEach((b) => bullet(b.text));
      doc.moveDown(0.35);
    }
  }
  if (cv.education.length) {
    section('Education');
    for (const ed of cv.education) {
      doc.font('Helvetica-Bold').fontSize(body).fillColor('#111').text(`${ed.qualification}${ed.field ? `, ${ed.field}` : ''}${ed.grade ? ` (${ed.grade})` : ''}`);
      doc.font('Helvetica').fontSize(9).fillColor('#555').text(`${ed.institution}  ·  ${ed.datesText ?? `${fmtMonth(ed.start)} – ${ed.inProgress ? `expected ${fmtMonth(ed.end)}` : fmtMonth(ed.end)}`}`);
      (ed.highlights ?? []).forEach((h) => bullet(h));
      doc.moveDown(0.25);
    }
  }
  if (cv.certifications.length) {
    section('Certifications');
    cv.certifications.forEach((c) => bullet(`${c.name}${c.issuer ? `, ${c.issuer}` : ''}${c.issuedAt ? ` (${fmtMonth(c.issuedAt)})` : ''}`));
  }
  if (cv.additional?.length) {
    section('Additional information');
    cv.additional.forEach((a) => bullet(a.text));
  }
  return toBuffer(doc);
}

export async function renderCoverLetterPdf(input: { name: string; email: string | null; phone: string | null; company: string; jobTitle: string; paragraphs: CvSentence[][] }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 64, right: 64 }, info: { Title: `Cover letter — ${input.jobTitle}`, Author: input.name } });
  doc.font('Helvetica-Bold').fontSize(14).text(input.name);
  doc.font('Helvetica').fontSize(9.5).fillColor('#444').text([input.email, input.phone].filter(Boolean).join('  ·  '));
  doc.moveDown(1.2).fillColor('#111').fontSize(10.5);
  doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  doc.moveDown(0.8).text(`Re: ${input.jobTitle}, ${input.company}`);
  doc.moveDown(0.8).text('Dear Hiring Manager,');
  for (const p of input.paragraphs) {
    doc.moveDown(0.7).text(p.map((s) => s.text).join(' '), { align: 'left', lineGap: 2 });
  }
  doc.moveDown(1).text('Yours sincerely,');
  doc.moveDown(0.3).text(input.name);
  return toBuffer(doc);
}
