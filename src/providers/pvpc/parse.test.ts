import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../fixtures.ts';
import { parseEsios, parseRedata, toSlots } from './parse.ts';
import { dayComplete, daySlots } from '../../prices.ts';
import { localDate, localMinutes } from '../../time.ts';

const MADRID = 'Europe/Madrid';

test('REData: today and tomorrow, hourly, in €/kWh, with the last update', () => {
  const { slots, updated } = parseRedata(fixture('redata-2026-11-24-25-peninsula.json'), 'peninsula');
  assert.equal(slots.length, 48);
  assert.deepEqual(slots[0], { start: Date.parse('2026-11-23T23:00:00Z'), minutes: 60, price: 0.1965 });
  assert.equal(slots[47]!.price, 0.27657);
  assert.equal(updated, Date.parse('2026-11-24T20:46:06+01:00'));
  assert.ok(dayComplete(slots, '2026-11-24', MADRID));
  assert.ok(dayComplete(slots, '2026-11-25', MADRID));
  assert.equal(daySlots(slots, '2026-11-25', MADRID).length, 24);
});

test('REData: the Canary Islands by clock hour, an hour after the Península', () => {
  const pen = parseRedata(fixture('redata-2026-11-24-25-peninsula.json'), 'peninsula').slots;
  const can = parseRedata(fixture('redata-2026-11-24-canarias.json'), 'canarias').slots;
  assert.equal(can.length, 24);
  assert.equal(can[0]!.start - pen[0]!.start, 3_600_000);
  assert.equal(localMinutes(can[0]!.start, 'Atlantic/Canary'), 0);
  assert.equal(localDate(can[0]!.start, 'Atlantic/Canary'), '2026-11-24');
  assert.equal(can[0]!.price, pen[0]!.price);
  assert.ok(dayComplete(can, '2026-11-24', 'Atlantic/Canary'));
});

test('REData: an error or a day not published yet throws', () => {
  assert.throws(() => parseRedata(fixture('redata-error.json'), 'peninsula'), /no están disponibles/);
  assert.throws(() => parseRedata(fixture('redata-unpublished.json'), 'peninsula'), /REData/);
  assert.throws(() => parseRedata({ data: {}, included: [] }, 'peninsula'), /no PVPC/);
});

test('ESIOS: indicator 1001, the values of one territory', () => {
  const { slots, updated } = parseEsios(fixture('esios-1001-2026-11-24.json'), 'peninsula', 8741);
  assert.equal(slots.length, 24);
  assert.equal(slots[0]!.price, 0.1965);
  assert.ok(updated);
  const can = parseEsios(fixture('esios-1001-2026-11-24.json'), 'canarias', 8742).slots;
  assert.equal(can[0]!.start - slots[0]!.start, 3_600_000);
});

test('DST: the day summer time ends has 25 hours, the day it starts 23', () => {
  const oct = parseRedata(fixture('redata-2026-10-25-dst-end.json'), 'peninsula').slots;
  assert.equal(oct.length, 25);
  assert.ok(oct.every((s) => s.minutes === 60));
  assert.ok(dayComplete(oct, '2026-10-25', MADRID));
  // 02:00 happens twice: two different instants, an hour apart.
  const twos = oct.filter((s) => localMinutes(s.start, MADRID) === 120);
  assert.equal(twos.length, 2);
  assert.equal(twos[1]!.start - twos[0]!.start, 3_600_000);
  const mar = parseRedata(fixture('redata-2026-03-29-dst-start.json'), 'peninsula').slots;
  assert.equal(mar.length, 23);
  assert.ok(dayComplete(mar, '2026-03-29', MADRID));
  assert.ok(!mar.some((s) => localMinutes(s.start, MADRID) === 120), 'no 02:00 that day');
});

test('quarter-hourly prices: each period is 15 minutes, read from the data', () => {
  // REE publishes the PVPC hourly today; quarter-hours are made up from the fixture, split in four.
  const doc = fixture('redata-2026-11-24-25-peninsula.json') as { included: { attributes: { values: { value: number; datetime: string }[] } }[] };
  const values = doc.included[0]!.attributes.values.flatMap((v, i) => [0, 1, 2, 3].map((q) => ({ value: v.value + q, datetime: new Date(Date.parse(v.datetime) + q * 900_000).toISOString(), i })));
  doc.included[0]!.attributes.values = values;
  const { slots } = parseRedata(doc, 'peninsula');
  assert.equal(slots.length, 192);
  assert.ok(slots.every((s) => s.minutes === 15));
  assert.ok(dayComplete(slots, '2026-11-24', MADRID));
});

test('a hole in the data does not make a period longer', () => {
  const t0 = Date.parse('2026-11-24T00:00:00+01:00');
  const slots = toSlots([0, 1, 2, 5, 6].map((h) => ({ start: t0 + h * 3_600_000, mwh: 100 })));
  assert.deepEqual(slots.map((s) => s.minutes), [60, 60, 60, 60, 60]);
  assert.ok(!dayComplete(slots, '2026-11-24', MADRID));
});
