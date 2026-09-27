/** Wall-clock parts of `date` in an IANA timezone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Start of the current day in `timeZone`, as a UTC Date. */
export function startOfDay(timeZone: string, now = new Date()): Date {
  const p = zonedParts(now, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset);
}

export function hhmm(timeZone: string, now = new Date()): string {
  const p = zonedParts(now, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
