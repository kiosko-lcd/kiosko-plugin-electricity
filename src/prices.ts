/**
 * What the widgets ask of the prices: a day's periods, how a price ranks in
 * its day, the period now, the cheapest runs of N hours and the next cheap
 * stretch. Pure functions of the data and a time.
 */
import { addDays, dayLengthMs, localDate, startOfDay } from './time.ts';
import type { Level, PriceWindow, PriceData, Slot } from './types.ts';

export const slotEnd = (s: Slot): number => s.start + s.minutes * 60_000;

/** The periods of a local day, in order. */
export function daySlots(slots: readonly Slot[], date: string, zone: string): Slot[] {
  const from = startOfDay(date, zone);
  const to = startOfDay(addDays(date, 1), zone);
  return slots.filter((s) => s.start >= from && s.start < to);
}

/** The day has a price for every minute of it (23, 24 or 25 hours). */
export function dayComplete(slots: readonly Slot[], date: string, zone: string): boolean {
  const day = daySlots(slots, date, zone);
  const minutes = day.reduce((a, s) => a + s.minutes, 0);
  return minutes * 60_000 >= dayLengthMs(date, zone);
}

/** The period `at` falls in, if known. */
export function slotAt(slots: readonly Slot[], at: number): Slot | undefined {
  return slots.find((s) => s.start <= at && at < slotEnd(s));
}

/** Average over periods, weighted by their length. */
export function average(slots: readonly Slot[]): number {
  const m = slots.reduce((a, s) => a + s.minutes, 0);
  return m ? slots.reduce((a, s) => a + s.price * s.minutes, 0) / m : NaN;
}

/** The value under which a share `q` (0..1) of the prices fall, interpolated; weighted by length. */
export function quantile(slots: readonly Slot[], q: number): number {
  // Quarter-hours count a quarter of an hour: expand to equal units of the smallest length.
  const unit = Math.min(...slots.map((s) => s.minutes));
  const values = slots.flatMap((s) => Array<number>(Math.max(1, Math.round(s.minutes / unit))).fill(s.price)).sort((a, b) => a - b);
  if (!values.length) return NaN;
  const pos = (values.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return values[lo]! + (values[hi]! - values[lo]!) * (pos - lo);
}

export interface Thresholds {
  /** At or under it: among the cheapest third of the day. */
  lo: number;
  /** At or over it: among the dearest third. */
  hi: number;
}

/** The day's tertiles: a third of its hours are cheap, a third expensive. */
export function thresholdsOf(day: readonly Slot[]): Thresholds {
  return { lo: quantile(day, 1 / 3), hi: quantile(day, 2 / 3) };
}

export function levelOf(price: number, t: Thresholds): Level {
  if (!(t.hi > t.lo)) return 'normal'; // a flat day: nothing stands out
  if (price <= t.lo) return 'cheap';
  if (price >= t.hi) return 'expensive';
  return 'normal';
}

/** Levels of every period, each against its own day's tertiles. */
export function levelsOf(slots: readonly Slot[], zone: string): Map<number, Level> {
  const out = new Map<number, Level>();
  const days = new Map<string, Slot[]>();
  for (const s of slots) {
    const d = localDate(s.start, zone);
    let list = days.get(d);
    if (!list) days.set(d, (list = []));
    list.push(s);
  }
  for (const day of days.values()) {
    const t = thresholdsOf(day);
    for (const s of day) out.set(s.start, levelOf(s.price, t));
  }
  return out;
}

/** Periods that run on one after another, from `i`, covering at least `minutes`; undefined when the data stops (or has a hole) first. */
function runFrom(slots: readonly Slot[], i: number, minutes: number): Slot[] | undefined {
  const run: Slot[] = [];
  let covered = 0;
  for (let k = i; k < slots.length; k++) {
    const s = slots[k]!;
    if (run.length && s.start !== slotEnd(run[run.length - 1]!)) return undefined;
    run.push(s);
    covered += s.minutes;
    if (covered >= minutes) return run;
  }
  return undefined;
}

/** A period that began less than this long ago still counts as "starting now". */
export const LATE_START_MS = 10 * 60_000;

/**
 * The cheapest `count` runs of `minutes` (that don't overlap), starting from
 * `from` on, as far as the prices go (tomorrow too, once published). Cheapest
 * first; on a tie, the earlier.
 */
export function cheapestWindows(slots: readonly Slot[], minutes: number, from: number, count = 1, until = Infinity): PriceWindow[] {
  const candidates: PriceWindow[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (s.start < from - LATE_START_MS || s.start >= until) continue;
    const run = runFrom(slots, i, minutes);
    if (!run || slotEnd(run[run.length - 1]!) > until) continue;
    candidates.push({ start: s.start, end: slotEnd(run[run.length - 1]!), avg: average(run) });
  }
  candidates.sort((a, b) => a.avg - b.avg || a.start - b.start);
  const picked: PriceWindow[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.every((p) => c.end <= p.start || c.start >= p.end)) picked.push(c);
  }
  return picked;
}

/** The day's cheapest run of `minutes`, over the whole local day (for the alert: "the cheapest 2 h of today start now"). */
export function cheapestOfDay(slots: readonly Slot[], date: string, zone: string, minutes: number): PriceWindow | undefined {
  const day = daySlots(slots, date, zone);
  return cheapestWindows(day, minutes, -Infinity, 1)[0];
}

export interface CheapRun {
  /** True: it is cheap now, until `end`. */
  now: boolean;
  start: number;
  end: number;
  avg: number;
}

/** The cheap stretch running now, or the next one, by each day's tertiles. */
export function nextCheap(slots: readonly Slot[], zone: string, at: number): CheapRun | undefined {
  const levels = levelsOf(slots, zone);
  let i = slots.findIndex((s) => slotEnd(s) > at && levels.get(s.start) === 'cheap');
  if (i < 0) return undefined;
  const run = [slots[i]!];
  while (++i < slots.length && levels.get(slots[i]!.start) === 'cheap' && slots[i]!.start === slotEnd(run[run.length - 1]!)) run.push(slots[i]!);
  const start = run[0]!.start;
  return { now: start <= at, start, end: slotEnd(run[run.length - 1]!), avg: average(run) };
}

/** The end of the run of periods above `price` that `at` is in (for the threshold alert). */
export function aboveUntil(slots: readonly Slot[], at: number, price: number): { start: number; end: number } | undefined {
  let i = slots.findIndex((s) => s.start <= at && at < slotEnd(s));
  if (i < 0 || !(slots[i]!.price > price)) return undefined;
  let j = i;
  while (i > 0 && slots[i - 1]!.price > price && slotEnd(slots[i - 1]!) === slots[i]!.start) i--;
  while (j + 1 < slots.length && slots[j + 1]!.price > price && slots[j + 1]!.start === slotEnd(slots[j]!)) j++;
  return { start: slots[i]!.start, end: slotEnd(slots[j]!) };
}

/** Today's and tomorrow's dates in the territory, and whether tomorrow is in yet. */
export function daysOf(data: Pick<PriceData, 'slots' | 'zone'>, now: number): { today: string; tomorrow: string; hasTomorrow: boolean } {
  const today = localDate(now, data.zone);
  const tomorrow = addDays(today, 1);
  return { today, tomorrow, hasTomorrow: daySlots(data.slots, tomorrow, data.zone).length > 0 };
}
