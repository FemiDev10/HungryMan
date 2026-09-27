export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word / whole-phrase containment on normalized text. */
export function hasPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${normalize(haystack)} `;
  const p = normalize(phrase);
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(h);
}

export function countPhrase(haystack: string, phrase: string): number {
  const h = normalize(haystack);
  const p = normalize(phrase);
  if (!p) return 0;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (h.match(new RegExp(`(^|[^a-z0-9])${escaped}(?=[^a-z0-9]|$)`, 'g')) ?? []).length;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Numbers (e.g. "40%", "3", "£2m", "1,200") that appear in a text — used to stop invented metrics. */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,]/g, '').replace(/\.$/, ''));
}
