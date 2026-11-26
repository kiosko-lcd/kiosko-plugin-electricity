import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import * as kit from '@loksly/lcd-canvas-kit';
import { THEMES, createBaseContext, defaultsOf } from '@kiosko/sdk';
import { renderWidget } from '@kiosko/sdk/testing';
import { MIN_PX, SOURCE } from './common.ts';
import { demoData } from './demo.ts';
import { fixture } from './fixtures.ts';
import { parseRedata } from './providers/pvpc/parse.ts';
import type { PriceData } from './types.ts';
import { chart } from './widget-chart.ts';
import { now } from './widget-now.ts';
import { windows } from './widget-windows.ts';

const at = (iso: string) => Date.parse(iso);
const EVENING = at('2026-11-24T21:10:00+01:00');
const MORNING = at('2026-11-24T10:42:00+01:00');
const SIZES = [{ w: 172, h: 320 }, { w: 320, h: 200 }, { w: 480, h: 240 }, { w: 1920, h: 120 }, { w: 800, h: 160 }, { w: 200, h: 36 }, { w: 140, h: 30 }, { w: 320, h: 480 }];
const LOCALES = ['en', 'es', 'zh-Hant'];
const WIDGETS = [now, chart, windows];

const real = (): PriceData => ({ at: EVENING, provider: 'pvpc', area: 'peninsula', zone: 'Europe/Madrid', origin: 'redata', credit: 'Red Eléctrica', updated: at('2026-11-24T20:46:06+01:00'), fetchedAt: EVENING, slots: parseRedata(fixture('redata-2026-11-24-25-peninsula.json'), 'peninsula').slots, stale: false });

test('every widget paints at every size and language, morning and evening, without throwing or spilling', () => {
  for (const w of WIDGETS)
    for (const size of SIZES)
      for (const locale of LOCALES)
        for (const t of [MORNING, EVENING]) {
          const r = renderWidget(w, { size, locale, now: t });
          assert.equal(r.error, undefined, `${w.id} ${size.w}x${size.h} ${locale}`);
          assert.equal(r.outside, 0);
          // A chart too short for labels is bars alone.
          if (w !== chart || size.h >= 70) assert.ok(r.texts.length > 0, `${w.id} ${size.w}x${size.h} ${locale} paints text`);
        }
});

/** Paints a widget and returns every text drawn, with its size. */
function sizesOf(w: (typeof WIDGETS)[number], data: PriceData, size: { w: number; h: number }, locale: string, t: number) {
  const texts: { text: string; size: number }[] = [];
  const spy = { ...kit, drawTracked: (g: never, text: string, x: number, y: number, o: { size: number }) => (texts.push({ text, size: o.size }), kit.drawTracked(g, text, x, y, o as never)) };
  const g = createCanvas(size.w, size.h).getContext('2d');
  const theme = THEMES[0]!;
  w.render(g as never, { ...createBaseContext({ now: t, locale }), options: defaultsOf(w.options as never), data: undefined, sources: { [SOURCE]: data }, working: true, box: { x: 0, y: 0, w: size.w, h: size.h }, theme, fonts: theme.fonts, kit: spy, canvas: { createCanvas }, preview: false } as never);
  return texts;
}

test('nothing under 11 px, in every language and size', () => {
  for (const w of WIDGETS)
    for (const size of SIZES)
      for (const locale of LOCALES)
        for (const t of [MORNING, EVENING]) {
          const small = sizesOf(w, demoData(t), size, locale, t).filter((x) => x.size < MIN_PX);
          assert.deepEqual(small, [], `${w.id} ${size.w}x${size.h} ${locale}`);
        }
});

test('now: the price, its rank and the next cheap stretch, in Spanish', () => {
  const r = renderWidget(now, { size: { w: 320, h: 200 }, locale: 'es', now: EVENING, sources: { [SOURCE]: real() } });
  assert.ok(r.texts.includes('0,310'), r.texts.join(' | '));
  assert.ok(r.texts.includes('Cara'));
  // 23:00 (0,190) is among the cheapest third of today.
  assert.ok(r.texts.includes('Próxima barata: 23:00–00:00'), r.texts.join(' | '));
  assert.ok(r.texts.some((t) => t === 'Red Eléctrica · 24 nov 20:46'), 'REE and the date of the last update');
});

test('now: in English on a 12-hour clock, and in Chinese', () => {
  const en = renderWidget(now, { size: { w: 320, h: 200 }, locale: 'en', timeFormat: '12h', now: MORNING });
  assert.ok(en.texts.includes('0.178'));
  assert.ok(en.texts.includes('Next cheap: 1:00 PM–4:00 PM'), en.texts.join(' | '));
  const zh = renderWidget(now, { size: { w: 320, h: 200 }, locale: 'zh-Hant', now: MORNING });
  assert.ok(zh.texts.includes('一般'), zh.texts.join(' | '));
});

test('chart: today, then today and tomorrow once published', () => {
  const m = renderWidget(chart, { size: { w: 480, h: 240 }, locale: 'es', now: MORNING });
  assert.ok(!m.texts.includes('Mañana'));
  const e = renderWidget(chart, { size: { w: 480, h: 240 }, locale: 'es', now: EVENING });
  assert.ok(e.texts.includes('Mañana'));
  const rows = renderWidget(chart, { size: { w: 172, h: 320 }, locale: 'es', now: EVENING });
  assert.equal(rows.texts[0], '21', 'a tall tile starts at this hour');
});

test('chart on the 25-hour day: 25 bars, 02 twice', () => {
  const slots = parseRedata(fixture('redata-2026-10-25-dst-end.json'), 'peninsula').slots;
  const data: PriceData = { ...real(), slots };
  const r = renderWidget(chart, { size: { w: 172, h: 600 }, locale: 'es', now: at('2026-10-25T00:30:00+02:00'), sources: { [SOURCE]: data } });
  assert.equal(r.error, undefined);
  const hours = r.texts.filter((t) => /^\d+$/.test(t));
  assert.equal(hours.filter((h) => h === '2').length, 2, hours.join(' '));
  assert.equal(hours.length, 25 - 0);
});

test('windows: the cheapest 2 h from now on, cheapest first, tomorrow marked', () => {
  const r = renderWidget(windows, { size: { w: 320, h: 200 }, locale: 'es', now: EVENING, sources: { [SOURCE]: real() }, options: { durationMs: 2 * 3_600_000, rows: 3, label: 'Lavadora' } });
  assert.ok(r.texts.includes('Lavadora · €/kWh'));
  assert.equal(r.texts[2], '14:00–16:00', r.texts.join(' | '));
  assert.equal(r.texts[1], '0,080');
  assert.match(r.texts[3]!, /^mañana · en 16 h 50 · -?−?\d+/);
  const tiny = renderWidget(windows, { size: { w: 200, h: 36 }, locale: 'en', now: MORNING });
  assert.deepEqual(tiny.texts, ['0.080', '2:00 PM–4:00 PM']);
});

test('windows: nothing left today and tomorrow not out yet', () => {
  const data = demoData(MORNING);
  const r = renderWidget(windows, { size: { w: 320, h: 200 }, locale: 'es', now: at('2026-11-24T22:30:00+01:00'), sources: { [SOURCE]: { ...data, slots: data.slots.filter((s) => s.start < at('2026-11-25T00:00:00+01:00')) } }, options: { durationMs: 3 * 3_600_000 } });
  assert.deepEqual(r.texts, ['No quedan precios de hoy', 'Los de mañana llegan hacia las 20:15']);
});

test('before any data: a waiting message', () => {
  for (const w of WIDGETS) {
    const r = renderWidget(w, { size: { w: 320, h: 200 }, locale: 'en', demo: false });
    assert.deepEqual(r.texts, ['Reading prices…']);
  }
});
