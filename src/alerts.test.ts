import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localize } from '@kiosko/sdk';
import { sourceAlerts } from '@kiosko/sdk/testing';
import { demoData } from './demo.ts';
import { pricesSource } from './source.ts';

const at = (iso: string) => Date.parse(iso);

test('no alerts by default', () => {
  assert.deepEqual(sourceAlerts(pricesSource, { now: at('2026-11-24T14:30:00+01:00') }), []);
});

test("the day's cheapest 2 h: an alert while they last, the same id all along", () => {
  const options = { alertCheapest: true, alertDurationMs: 2 * 3_600_000 };
  // The demo's day: 14:00–16:00 is the cheapest 2 h (0,055 and 0,105).
  const data = demoData(at('2026-11-24T10:00:00+01:00'));
  const a = sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T14:05:00+01:00') });
  assert.equal(a.length, 1);
  assert.equal(a[0]!.level, 'info');
  assert.equal(a[0]!.expiresAt, at('2026-11-24T16:00:00+01:00'));
  assert.equal(localize(a[0]!.title, 'es'), 'Las 2 h más baratas del día: ahora');
  assert.equal(localize(a[0]!.text, 'es'), '14:00–16:00 · 0,080 €/kWh');
  assert.equal(localize(a[0]!.source, 'es'), 'REE');
  const b = sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T15:55:00+01:00') });
  assert.equal(b[0]!.id, a[0]!.id);
  assert.deepEqual(sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T16:00:00+01:00') }), []);
  assert.deepEqual(sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T13:59:00+01:00') }), []);
});

test('over a threshold: one alert per stretch above it, until it ends', () => {
  const options = { alertAbove: 0.35 };
  const data = demoData(at('2026-11-24T10:00:00+01:00'));
  const a = sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T19:10:00+01:00') });
  assert.equal(a.length, 1);
  assert.equal(a[0]!.level, 'warn');
  assert.equal(localize(a[0]!.title, 'en'), 'Electricity over 0.350 €/kWh');
  assert.equal(localize(a[0]!.text, 'de'), '0,376 €/kWh · 18:00–22:00');
  assert.equal(a[0]!.expiresAt, at('2026-11-24T22:00:00+01:00'));
  const b = sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T21:30:00+01:00') });
  assert.equal(b[0]!.id, a[0]!.id);
  assert.deepEqual(sourceAlerts(pricesSource, { options, data, now: at('2026-11-24T12:00:00+01:00') }), []);
});
