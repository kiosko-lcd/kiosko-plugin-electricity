/**
 * Days and clock times in a given time zone (Europe/Madrid, Atlantic/Canary),
 * whatever the zone of the machine running Kiosko. A day is cut at local
 * midnight, so the day summer time starts has 23 hours and the day it ends
 * has 25.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formats.set(zone, f);
  }
  return f;
}

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

export function partsOf(ms: number, zone: string): Parts {
  const o: Record<string, number> = {};
  for (const p of partsFormat(zone).formatToParts(ms)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour! % 24, min: o.minute!, s: o.second! };
}

/** How far ahead of UTC the zone's clock is at that instant, in ms. */
export function offsetMs(ms: number, zone: string): number {
  const p = partsOf(ms, zone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-24`: the local date of an instant. */
export function localDate(ms: number, zone: string): string {
  const p = partsOf(ms, zone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Minutes since local midnight, by the wall clock (on the day summer time ends, 02:30 happens twice). */
export function localMinutes(ms: number, zone: string): number {
  const p = partsOf(ms, zone);
  return p.h * 60 + p.min;
}

/** The date `n` days after `date`. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The instant local midnight starts `date` (never in a summer-time gap in Spain: those are at 2:00). */
export function startOfDay(date: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d);
  let t = utc - offsetMs(utc, zone);
  // The offset at the guess may differ from the one at midnight: correct once.
  t = utc - offsetMs(t, zone);
  return t;
}

/** How long the local day is: 24 h, or 23 / 25 on the days the clock changes. */
export function dayLengthMs(date: string, zone: string): number {
  return startOfDay(addDays(date, 1), zone) - startOfDay(date, zone);
}

/** The instant a wall-clock time of the day is reached (the first time, if it happens twice). */
export function atLocal(date: string, minutes: number, zone: string): number {
  const start = startOfDay(date, zone);
  // Walk from midnight by the offset change: exact except inside a skipped hour.
  const guess = start + minutes * 60_000;
  const shift = offsetMs(start, zone) - offsetMs(guess, zone);
  const t = guess + shift;
  return localMinutes(t, zone) === minutes % 1440 ? t : guess;
}
