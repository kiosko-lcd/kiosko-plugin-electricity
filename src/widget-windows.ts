/**
 * `electricity/windows`: when to run the washing machine. The cheapest runs of N
 * hours in a row from now on (tomorrow too, once published), cheapest first:
 * "14:00–16:00 · 0,081 €/kWh, in 2 h 10, −35 % vs now".
 */
import { defineWidget, listOptions, localize, t, type Graphics } from '@kiosko/sdk';
import { clamp, clipped, dataOf, drawMessage, drawSourceLine, levelInk, MIN_PX, SOURCE, type Ctx } from './common.ts';
import { demoData } from './demo.ts';
import { clockRange, priceText, UNIT } from './format.ts';
import { L } from './i18n.ts';
import { BEST_HOURS, fill, IN, NO_WINDOW, NOW_TAG, TOMORROW_AT, TOMORROW_TAG, WAITING } from './labels.ts';
import { cheapestWindows, daySlots, levelOf, slotAt, thresholdsOf } from './prices.ts';
import { localDate } from './time.ts';
import type { PriceWindow, PriceData } from './types.ts';

const VS_NOW = L('{p} vs now', '{p} frente a ahora', '{p} ggü. jetzt', '比现在 {p}', '比現在 {p}');

export interface WindowRow {
  w: PriceWindow;
  /** "14:00–16:00". */
  range: string;
  /** "tomorrow", or '' for today. */
  day: string;
  price: string;
  /** "in 2 h 10" / "now". */
  starts: string;
  /** "−35 % vs now", or '' when it isn't cheaper. */
  vsNow: string;
  color: string;
}

/** The rows the widget shows, worked out from the data. */
/** A run's length in whole quarters of an hour, 1 to 4 hours. */
export const runMinutes = (ms: number): number => clamp(Math.round(ms / 900_000) * 15, 60, 240);

export function windowRows(ctx: Ctx, data: PriceData, durationMs: number, count: number): WindowRow[] {
  const { zone } = data;
  const today = localDate(ctx.now, zone);
  const wins = cheapestWindows(data.slots, runMinutes(durationMs), ctx.now, clamp(Math.round(count), 1, 5));
  const cur = slotAt(data.slots, ctx.now);
  const pct = new Intl.NumberFormat(ctx.locale, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
  return wins.map((w) => {
    const date = localDate(w.start, zone);
    const th = thresholdsOf(daySlots(data.slots, date, zone));
    const rel = cur ? (w.avg - cur.price) / cur.price : 0;
    return {
      w,
      range: clockRange(ctx.locale, zone, ctx.fmt.hour12, w.start, w.end),
      day: date !== today ? ctx.t(TOMORROW_TAG) : '',
      price: priceText(ctx.locale, w.avg),
      // "in 1 d 0 h" reads badly: a day or more away, "tomorrow" says it.
      starts: w.start <= ctx.now ? ctx.t(NOW_TAG) : w.start - ctx.now >= 20 * 3_600_000 ? '' : fill(ctx.t(IN), { d: ctx.fmt.duration(w.start - ctx.now, { round: 'up' }) }),
      vsNow: cur && rel <= -0.01 ? fill(ctx.t(VS_NOW), { p: pct.format(rel) }) : '',
      color: levelInk(ctx, levelOf(w.avg, th)),
    };
  });
}

function drawRow(g: Graphics, ctx: Ctx, r: WindowRow, box: { x: number; y: number; w: number; h: number }, size: number, two: boolean, best: boolean): void {
  const { kit, theme } = ctx;
  const c = theme.colors;
  const small = clamp(Math.round(size * 0.62), MIN_PX, 20);
  const block = two ? size + small * 1.45 : size;
  const top = box.y + (box.h - block) / 2;
  const base = top + size * 0.86;
  const fPrice = { size, family: best ? theme.fonts.sansBold : theme.fonts.sans, color: r.color, align: 'right' as const };
  const priceW = kit.measureTracked(g, r.price, fPrice);
  const fWhen = { size, family: best ? theme.fonts.sansBold : theme.fonts.sans, color: best ? c.ink : c.inkDim };
  const room = box.w - priceW - size * 0.6;
  // The day goes in front of the time on one line, in the line under it on two.
  const withDay = r.day ? `${r.day} ${r.range}` : r.range;
  const pick = (w: number) => (!two && kit.measureTracked(g, withDay, fWhen) <= w ? withDay : r.range);
  if (room >= size * 3) {
    kit.drawTracked(g, r.price, box.x + box.w, base, fPrice);
    // On one line, a time a bit smaller rather than cut ("2:00 PM–4:…").
    const fit = two ? fWhen : { ...fWhen, size: kit.fitSize(g, pick(room), room, fWhen, Math.max(MIN_PX, Math.round(size * 0.75))) };
    kit.drawTracked(g, kit.truncate(g, pick(room), room, fit), box.x, base, fit);
  } else {
    kit.drawTracked(g, kit.truncate(g, pick(box.w), box.w, fWhen), box.x, base, fWhen);
  }
  if (two) {
    const f2 = { size: small, family: theme.fonts.sans, color: r.day ? c.inkDim : c.inkFaint };
    const sub = [r.day, r.starts, r.vsNow].filter(Boolean).join(' · ');
    kit.drawTracked(g, kit.truncate(g, sub, box.w, f2), box.x, base + small * 1.45, f2);
  }
}

function render(g: Graphics, ctx: Ctx): void {
  const data = dataOf(ctx.sources);
  if (!data) return drawMessage(g, ctx, ctx.t(WAITING));
  const o = ctx.options as { durationMs: number; rows: number; label: string };
  // 0 rows: as many as fit, up to five.
  const rows = windowRows(ctx, data, o.durationMs, o.rows || 5);
  if (!rows.length) return drawMessage(g, ctx, ctx.t(NO_WINDOW), ctx.t(TOMORROW_AT));
  const { box, kit, theme } = ctx;
  const c = theme.colors;
  const title = o.label.trim() || fill(ctx.t(BEST_HOURS), { d: ctx.fmt.duration(runMinutes(o.durationMs) * 60_000, { compact: true }) });

  // One line: the best one.
  if (box.h < 46) {
    const size = clamp(Math.round(box.h * 0.62), MIN_PX, 22);
    drawRow(g, ctx, rows[0]!, box, size, false, true);
    return;
  }
  const s = clamp(Math.round(Math.min(box.h * 0.08, box.w / 16)), MIN_PX, 20);
  const foot = clamp(Math.round(s * 0.85), MIN_PX, 16);
  const headH = box.h >= 80 ? Math.round(s * 1.7) : 0;
  const footH = box.h >= 170 ? Math.round(foot * 1.7) : 0;
  const area = { x: box.x, y: box.y + headH, w: box.w, h: box.h - headH - footH };
  if (headH) {
    const f = { size: s, family: theme.fonts.sans, color: c.inkDim };
    const unit = ` · ${UNIT}`;
    const text = kit.measureTracked(g, title + unit, f) <= box.w ? title + unit : title;
    kit.drawTracked(g, kit.truncate(g, text, box.w, f), box.x, box.y + s, f);
  }
  // Side by side in a wide strip, one under another elsewhere.
  const cols = box.w >= box.h * 3 && rows.length > 1 && box.w / rows.length >= 300 ? rows.length : 1;
  if (cols > 1) {
    const gutter = Math.round(s * 1.5);
    const colW = (area.w - gutter * (cols - 1)) / cols;
    const size = clamp(Math.round(Math.min(area.h * 0.36, colW / 9)), MIN_PX, 40);
    const two = area.h >= size * 2.2;
    rows.forEach((r, i) => drawRow(g, ctx, r, { x: area.x + i * (colW + gutter), y: area.y, w: colW, h: area.h }, size, two, i === 0));
  } else {
    const fit = Math.max(1, Math.min(rows.length, Math.floor(area.h / (MIN_PX * 1.6))));
    const size = clamp(Math.round(Math.min((area.h / fit) * 0.42, box.w / 10.5)), MIN_PX, 40);
    // Rows no taller than they need, from the top: a tall tile doesn't spread them thin.
    const rowH = Math.min(area.h / fit, size * 2.9);
    const two = rowH >= size * 2.25;
    rows.slice(0, fit).forEach((r, i) => drawRow(g, ctx, r, { x: area.x, y: area.y + i * rowH, w: area.w, h: rowH }, size, two, i === 0));
  }
  if (footH) drawSourceLine(g, ctx, data, box.y + box.h - foot * 0.35, foot);
}

export const windows = defineWidget({
  id: 'windows',
  name: L('Cheapest hours', 'Horas más baratas', 'Günstigste Stunden', '最便宜时段', '最便宜時段'),
  description: L(
    'When to run the washing machine or the dishwasher: the cheapest runs of 1 to 4 hours in a row from now on, tomorrow too once published, with their average price and how much cheaper than now.',
    'Cuándo poner la lavadora o el lavavajillas: los tramos de 1 a 4 horas seguidas más baratos de aquí en adelante, también los de mañana cuando se publiquen, con su precio medio y cuánto más barato que ahora.',
    'Wann die Waschmaschine oder die Spülmaschine laufen soll: die günstigsten Abschnitte von 1 bis 4 Stunden am Stück ab jetzt, auch morgen, sobald veröffentlicht, mit Durchschnittspreis und um wie viel günstiger als jetzt.',
    '什么时候开洗衣机或洗碗机：从现在起连续 1 到 4 小时最便宜的时段，明天的电价公布后也包括在内，显示平均价格以及比现在便宜多少。',
    '什麼時候開洗衣機或洗碗機：從現在起連續 1 到 4 小時最便宜的時段，明天的電價公布後也包括在內，顯示平均價格以及比現在便宜多少。',
  ),
  icon: 'washing-machine',
  category: 'info',
  tags: ['electricity', 'energy', 'prices', 'pvpc', 'luz'],
  size: { min: { w: 140, h: 30 }, preferred: { w: 320, h: 200 } },
  sources: [SOURCE],
  options: t.object({
    durationMs: t.duration({
      default: 2 * 3_600_000,
      min: 3_600_000,
      max: 4 * 3_600_000,
      label: L('How long', 'Duración', 'Dauer', '时长', '時長'),
      help: L('How long the appliance runs, 1 to 4 hours.', 'Lo que dura el programa del electrodoméstico, de 1 a 4 horas.', 'Wie lange das Gerät läuft, 1 bis 4 Stunden.', '电器运行的时长，1 到 4 小时。', '電器運轉的時長，1 到 4 小時。'),
    }),
    ...listOptions({ rows: 3 }),
    label: t.string({
      label: L('Name', 'Nombre', 'Name', '名称', '名稱'),
      help: L('Above the list, e.g. "Washing machine". Empty: "Cheapest 2 h".', 'Encima de la lista, p. ej. «Lavadora». Vacío: «Las 2 h más baratas».', 'Über der Liste, z. B. „Waschmaschine“. Leer: „Günstigste 2 h“.', '显示在列表上方，例如“洗衣机”。留空：“最便宜的 2 小时”。', '顯示在清單上方，例如「洗衣機」。留空：「最便宜的 2 小時」。'),
      placeholder: 'Lavadora',
      maxLength: 40,
    }),
  }),
  redraw: 'minute',
  /** No run of that length left in the prices known: "No window left" until tomorrow's are out. */
  empty: ({ sources, options, now: at }) => {
    const d = dataOf(sources);
    return !!d && !cheapestWindows(d.slots, runMinutes(options.durationMs), at, 1).length;
  },
  render(g, ctx) {
    clipped(g, ctx, () => render(g, ctx));
  },
  demo: ({ now: at, locale }) => ({
    sources: { [SOURCE]: demoData(at) },
    options: { label: localize(L('Washing machine', 'Lavadora', 'Waschmaschine', '洗衣机', '洗衣機'), locale) },
  }),
});
