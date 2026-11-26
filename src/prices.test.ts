import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRedata } from './providers/pvpc/parse.ts';
import { fixture } from './fixtures.ts';
import { aboveUntil, average, cheapestOfDay, cheapestWindows, daySlots, levelOf, levelsOf, nextCheap, slotAt, slotEnd, thresholdsOf } from './prices.ts';
import { atLocal, dayLengthMs, localMinutes, startOfDay } from './time.ts';
import type { Slot } from './types.ts';

const MADRID = 'Europe/Madrid';
const real = () => parseRedata(fixture('redata-2026-11-24-25-peninsula.json'), 'peninsula').slots;
const at = (iso: string) => Date.parse(iso);

/** The cheapest run of `n` consecutive slots, the slow obvious way. */
function bruteForce(slots: Slot[], n: number, from: number): { start: number; avg: number } {
  let best = { start: NaN, avg: Infinity };
  for (let i = 0; i + n <= slots.length; i++) {
    if (slots[i]!.start < from - 10 * 60_000) continue;
    const avg = slots.slice(i, i + n).reduce((a, s) => a + s.price, 0) / n;
    if (avg < best.avg) best = { start: slots[i]!.start, avg };
  }
  return best;
}

test('days: 24, 23 and 25 hours long, cut at local midnight', () => {
  assert.equal(dayLengthMs('2026-11-24', MADRID), 24 * 3_600_000);
  assert.equal(dayLengthMs('2026-03-29', MADRID), 23 * 3_600_000);
  assert.equal(dayLengthMs('2026-10-25', MADRID), 25 * 3_600_000);
  assert.equal(startOfDay('2026-10-25', MADRID), at('2026-10-24T22:00:00Z'));
  assert.equal(startOfDay('2026-10-26', MADRID), at('2026-10-25T23:00:00Z'));
  assert.equal(startOfDay('2026-11-24', 'Atlantic/Canary'), at('2026-11-24T00:00:00Z'));
  // 20:30 on the days the clock changes.
  assert.equal(atLocal('2026-03-29', 20 * 60 + 30, MADRID), at('2026-03-29T18:30:00Z'));
  assert.equal(atLocal('2026-10-25', 20 * 60 + 30, MADRID), at('2026-10-25T19:30:00Z'));
  assert.equal(atLocal('2026-10-25', 3 * 60, MADRID), at('2026-10-25T02:00:00Z'));
});

test('ranking: a third of the day cheap, a third expensive', () => {
  const day = daySlots(real(), '2026-11-24', MADRID);
  const levels = levelsOf(day, MADRID);
  const count = (l: string) => [...levels.values()].filter((x) => x === l).length;
  assert.equal(count('cheap'), 8);
  assert.equal(count('expensive'), 8);
  assert.equal(count('normal'), 8);
  const th = thresholdsOf(day);
  assert.equal(levelOf(Math.min(...day.map((s) => s.price)), th), 'cheap');
  assert.equal(levelOf(Math.max(...day.map((s) => s.price)), th), 'expensive');
  // A flat day has nothing cheap or expensive.
  const flat = day.map((s) => ({ ...s, price: 0.15 }));
  assert.ok([...levelsOf(flat, MADRID).values()].every((l) => l === 'normal'));
});

test('ranking on DST days: 23 and 25 periods, each against its own day', () => {
  for (const [f, n] of [['redata-2026-10-25-dst-end.json', 25], ['redata-2026-03-29-dst-start.json', 23]] as const) {
    const slots = parseRedata(fixture(f), 'peninsula').slots;
    const levels = [...levelsOf(slots, MADRID).values()];
    assert.equal(levels.length, n);
    const cheap = levels.filter((l) => l === 'cheap').length;
    assert.ok(cheap >= Math.floor(n / 3) && cheap <= Math.ceil(n / 3) + 1, `${f}: ${cheap} cheap`);
  }
});

test('the period now, and its end', () => {
  const s = slotAt(real(), at('2026-11-24T21:10:00+01:00'))!;
  assert.equal(s.start, at('2026-11-24T21:00:00+01:00'));
  assert.equal(slotEnd(s), at('2026-11-24T22:00:00+01:00'));
  assert.equal(slotAt(real(), at('2026-11-27T10:00:00+01:00')), undefined);
});

test('cheapest windows: the same as brute force, for 1 to 4 hours, across midnight', () => {
  const slots = real();
  for (const from of [at('2026-11-24T00:00:00+01:00'), at('2026-11-24T10:42:00+01:00'), at('2026-11-24T21:10:00+01:00')]) {
    for (let h = 1; h <= 4; h++) {
      const [w] = cheapestWindows(slots, h * 60, from, 1);
      const b = bruteForce(slots, h, from);
      assert.equal(w!.start, b.start, `${h} h from ${new Date(from).toISOString()}`);
      assert.ok(Math.abs(w!.avg - b.avg) < 1e-9);
      assert.equal(w!.end - w!.start, h * 3_600_000);
    }
  }
  // 21:10, tomorrow published: the best 2 h are tomorrow at 14:00 (0,055 and 0,105).
  const [best] = cheapestWindows(slots, 120, at('2026-11-24T21:10:00+01:00'), 1);
  assert.equal(best!.start, at('2026-11-25T14:00:00+01:00'));
});

test('cheapest windows: several, never overlapping, cheapest first', () => {
  const wins = cheapestWindows(real(), 120, at('2026-11-24T21:10:00+01:00'), 3);
  assert.equal(wins.length, 3);
  for (let i = 1; i < wins.length; i++) assert.ok(wins[i]!.avg >= wins[i - 1]!.avg);
  for (const a of wins) for (const b of wins) if (a !== b) assert.ok(a.end <= b.start || a.start >= b.end);
});

test('cheapest windows: a period that began a few minutes ago still counts, one long begun does not', () => {
  // Until noon: 04:00 (0,190) is the cheapest hour left at 04:05.
  const slots = daySlots(real(), '2026-11-24', MADRID).filter((s) => s.start < at('2026-11-24T12:00:00+01:00'));
  const t = at('2026-11-24T04:05:00+01:00');
  assert.equal(cheapestWindows(slots, 60, t, 1)[0]!.start, at('2026-11-24T04:00:00+01:00'));
  const late = at('2026-11-24T04:30:00+01:00');
  assert.ok(cheapestWindows(slots, 60, late, 5).every((w) => w.start >= late));
});

test('cheapest windows: no run longer than the data left, none over a hole', () => {
  const day = daySlots(real(), '2026-11-24', MADRID);
  assert.deepEqual(cheapestWindows(day, 180, at('2026-11-24T22:30:00+01:00'), 1), []);
  const holed = day.filter((_, i) => i !== 3);
  assert.ok(cheapestWindows(holed, 120, -Infinity, 10).every((w) => !(w.start < day[3]!.start && w.end > day[3]!.start)));
});

test('cheapest windows on the 25-hour day: 02:00 twice is two hours', () => {
  const slots = parseRedata(fixture('redata-2026-10-25-dst-end.json'), 'peninsula').slots;
  const w = cheapestOfDay(slots, '2026-10-25', MADRID, 240)!;
  assert.equal(w.end - w.start, 4 * 3_600_000);
  const b = bruteForce(slots, 4, -Infinity);
  assert.equal(w.start, b.start);
});

test('quarter-hours: a 2 h window is 8 periods, weighted the same', () => {
  const hours = daySlots(real(), '2026-11-24', MADRID);
  const quarters = hours.flatMap((s) => [0, 1, 2, 3].map((q) => ({ start: s.start + q * 900_000, minutes: 15, price: s.price })));
  const a = cheapestWindows(hours, 120, -Infinity, 1)[0]!;
  const b = cheapestWindows(quarters, 120, -Infinity, 1)[0]!;
  assert.equal(b.start, a.start);
  assert.ok(Math.abs(a.avg - b.avg) < 1e-9);
  assert.deepEqual([...levelsOf(quarters, MADRID).values()].filter((l) => l === 'cheap').length, 32);
  assert.ok(Math.abs(average(quarters) - average(hours)) < 1e-9);
});

test('next cheap: running now until its end, or the next one', () => {
  const slots = real();
  const now = nextCheap(slots, MADRID, at('2026-11-24T03:30:00+01:00'))!;
  assert.equal(now.now, true);
  assert.equal(localMinutes(now.end, MADRID), 6 * 60);
  const next = nextCheap(slots, MADRID, at('2026-11-24T21:10:00+01:00'))!;
  assert.equal(next.now, false);
  assert.ok(next.start > at('2026-11-24T21:10:00+01:00'));
});

test('over a threshold: the whole stretch above it', () => {
  const r = aboveUntil(real(), at('2026-11-24T19:30:00+01:00'), 0.3)!;
  assert.equal(r.start, at('2026-11-24T18:00:00+01:00'));
  assert.equal(r.end, at('2026-11-24T22:00:00+01:00'));
  assert.equal(aboveUntil(real(), at('2026-11-24T03:30:00+01:00'), 0.3), undefined);
});
