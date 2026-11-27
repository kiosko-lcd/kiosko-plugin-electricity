/**
 * `electricity/now`: the price of this hour, big, in green, grey or amber by how it
 * ranks in the day, and when the next cheap stretch is.
 */
import { defineWidget, t, type Graphics } from '@kiosko/sdk';
import { clamp, clipped, dataOf, drawMessage, drawSourceLine, levelColor, levelInk, MIN_PX, SOURCE, type Ctx } from './common.ts';
import { hourly } from './widget-chart.ts';
import { demoData } from './demo.ts';
import { clock, clockRange, hourLabel, priceText, UNIT } from './format.ts';
import { L } from './i18n.ts';
import { CHEAP_UNTIL, fill, LEVEL_LABELS, MIN_MAX, NEXT_CHEAP, NO_TODAY, NOW, TOMORROW_TAG, WAITING } from './labels.ts';
import { daySlots, levelOf, levelsOf, nextCheap, slotAt, slotEnd, thresholdsOf } from './prices.ts';
import { localDate } from './time.ts';
import type { Level, PriceData } from './types.ts';

interface Line {
  text: string;
  size: number;
  color: string;
  bold?: boolean;
}

/** Everything the widget says, worked out once. */
export function nowFacts(ctx: Ctx, data: PriceData) {
  const { zone } = data;
  const cur = slotAt(data.slots, ctx.now);
  if (!cur) return undefined;
  const today = localDate(ctx.now, zone);
  const day = daySlots(data.slots, today, zone);
  const level: Level = levelOf(cur.price, thresholdsOf(day));
  const h12 = ctx.fmt.hour12;
  const when = (a: number, b: number) => `${localDate(a, zone) !== today ? `${ctx.t(TOMORROW_TAG)} ` : ''}${clockRange(ctx.locale, zone, h12, a, b)}`;
  const nc = nextCheap(data.slots, zone, ctx.now);
  let next = '';
  if (nc?.now) next = fill(ctx.t(CHEAP_UNTIL), { t: `${localDate(nc.end - 1, zone) !== today ? `${ctx.t(TOMORROW_TAG)} ` : ''}${clock(ctx.locale, zone, h12, nc.end)}` });
  else if (nc) next = fill(ctx.t(NEXT_CHEAP), { when: when(nc.start, nc.end) });
  const prices = day.map((s) => s.price);
  const minMax = prices.length ? fill(ctx.t(MIN_MAX), { lo: priceText(ctx.locale, Math.min(...prices)), hi: priceText(ctx.locale, Math.max(...prices)) }) : '';
  return {
    price: priceText(ctx.locale, cur.price),
    level,
    levelText: ctx.t(LEVEL_LABELS[level]),
    head: `${ctx.t(NOW)} · ${clockRange(ctx.locale, zone, h12, cur.start, slotEnd(cur))}`,
    next,
    minMax,
  };
}

function drawLines(g: Graphics, ctx: Ctx, lines: Line[], x: number, top: number, w: number): void {
  const { kit, theme } = ctx;
  let y = top;
  for (const l of lines) {
    y += l.size * 1.3;
    const font = { size: l.size, family: l.bold ? theme.fonts.sansBold : theme.fonts.sans, color: l.color };
    kit.drawTracked(g, kit.truncate(g, l.text, w, font), x, y - l.size * 0.3, font);
  }
}

const linesHeight = (lines: Line[]) => lines.reduce((a, l) => a + l.size * 1.3, 0);

/** The big number and its unit after it, as big as `maxSize` and the width allow; returns its size. */
function bigSize(g: Graphics, ctx: Ctx, price: string, w: number, maxSize: number, unitSize: number): number {
  const { kit, theme } = ctx;
  const unitW = kit.measureTracked(g, UNIT, { size: unitSize, family: theme.fonts.sans }) + unitSize * 0.4;
  return kit.fitSize(g, price, Math.max(10, w - unitW), { size: Math.max(MIN_PX, Math.round(maxSize)), family: theme.fonts.sansBold }, MIN_PX);
}

function drawBig(g: Graphics, ctx: Ctx, price: string, color: string, x: number, baseline: number, size: number, unitSize: number): void {
  const { kit, theme } = ctx;
  const w = kit.drawTracked(g, price, x, baseline, { size, family: theme.fonts.sansBold, color });
  kit.drawTracked(g, UNIT, x + w + unitSize * 0.4, baseline, { size: unitSize, family: theme.fonts.sans, color: theme.colors.inkDim });
}

function render(g: Graphics, ctx: Ctx): void {
  const data = dataOf(ctx.sources);
  if (!data) return drawMessage(g, ctx, ctx.t(WAITING));
  const f = nowFacts(ctx, data);
  if (!f) return drawMessage(g, ctx, ctx.t(NO_TODAY));
  const { box, kit, theme } = ctx;
  const c = theme.colors;
  const color = levelInk(ctx, f.level);
  const showNext = ctx.options.showNext !== false;

  // One line: "0,276 €/kWh  Expensive".
  if (box.h < 46) {
    const size = clamp(Math.round(box.h * 0.72), MIN_PX, 30);
    const small = clamp(Math.round(size * 0.6), MIN_PX, 18);
    const big = bigSize(g, ctx, f.price, box.w, size, small);
    const base = box.y + box.h / 2 + big * 0.36;
    drawBig(g, ctx, f.price, color, box.x, base, big, small);
    const used = kit.measureTracked(g, f.price, { size: big, family: theme.fonts.sansBold }) + small * 0.4 + kit.measureTracked(g, UNIT, { size: small, family: theme.fonts.sans }) + small;
    const font = { size: small, family: theme.fonts.sansBold, color };
    if (box.w - used > small * 3) kit.drawTracked(g, kit.truncate(g, f.levelText, box.w - used, font), box.x + used, base, font);
    return;
  }

  // Wide strip: the price on the left, the rest beside it.
  if (box.w >= Math.max(box.h * 2.4, 560)) {
    const s = clamp(Math.round(box.h * 0.13), MIN_PX, 26);
    const head: Line = { text: f.head, size: s, color: c.inkDim };
    const unit = clamp(Math.round(s * 0.9), MIN_PX, 24);
    const big = bigSize(g, ctx, f.price, box.w * 0.5, Math.min(box.h * 0.62, 150), unit);
    // The left column is as wide as its content, so the rest sits close to the price.
    const leftW = Math.min(
      box.w * 0.5,
      Math.max(
        kit.measureTracked(g, f.price, { size: big, family: theme.fonts.sansBold }) + unit * 0.4 + kit.measureTracked(g, UNIT, { size: unit, family: theme.fonts.sans }),
        kit.measureTracked(g, f.head, { size: s, family: theme.fonts.sans }),
      ),
    );
    const block = head.size * 1.3 + big * 1.05;
    const top = box.y + (box.h - block) / 2;
    drawLines(g, ctx, [head], box.x, top, leftW);
    drawBig(g, ctx, f.price, color, box.x, top + head.size * 1.3 + big * 0.86, big, unit);
    const rx = box.x + leftW + s * 2;
    const rw = box.x + box.w - rx;
    const right: Line[] = [{ text: f.levelText, size: Math.round(s * 1.25), color, bold: true }];
    if (showNext && f.next) right.push({ text: f.next, size: s, color: c.ink });
    if (f.minMax) right.push({ text: f.minMax, size: s, color: c.inkDim });
    const foot = clamp(Math.round(s * 0.8), MIN_PX, 18);
    while (right.length > 1 && linesHeight(right) + foot * 1.6 > box.h) right.pop();
    const withFoot = linesHeight(right) + foot * 1.6 <= box.h;
    const rh = linesHeight(right) + (withFoot ? foot * 1.6 : 0);
    const rtop = box.y + (box.h - rh) / 2;
    drawLines(g, ctx, right, rx, rtop, rw);
    if (withFoot) clipped(g, { ...ctx, box: { x: rx, y: box.y, w: rw, h: box.h } }, () => drawSourceLine(g, { ...ctx, box: { x: rx, y: box.y, w: rw, h: box.h } }, data, rtop + rh - foot * 0.3, foot));
    return;
  }

  // Stacked: head, price, level, next cheap, min/max and REE's line, as many as fit.
  const s = clamp(Math.round(Math.min(box.h * 0.085, box.w / 12)), MIN_PX, 24);
  const foot = clamp(Math.round(s * 0.85), MIN_PX, 18);
  // A narrow tile: the unit goes after the level, so the number can take the whole width.
  const unitBelow = box.w < 260;
  const nextLines: Line[] = [];
  if (showNext && f.next) {
    const font = { size: s, family: theme.fonts.sans };
    const cut = f.next.search(/[:：] /) >= 0 ? f.next.search(/[:：] /) + 1 : f.next.indexOf('：') + 1;
    if (kit.measureTracked(g, f.next, font) > box.w && cut > 0) {
      nextLines.push({ text: f.next.slice(0, cut).trim(), size: s, color: c.inkDim }, { text: f.next.slice(cut).trim(), size: s, color: c.ink });
    } else nextLines.push({ text: f.next, size: s, color: c.ink });
  }
  const lines = {
    head: [{ text: f.head, size: s, color: c.inkDim }] as Line[],
    level: [{ text: f.levelText, size: Math.round(s * 1.3), color, bold: true }] as Line[],
    next: nextLines,
    minMax: f.minMax ? ([{ text: f.minMax, size: s, color: c.inkDim }] as Line[]) : [],
  };
  // Dropped first when short of room: the footer, min/max, the head, the next cheap, the level.
  const order = ['level', 'next', 'head', 'minMax', 'foot'] as const;
  let keep: (typeof order)[number][] = order.filter((k) => k === 'foot' || lines[k].length);
  const unit = clamp(Math.round(s * 0.9), MIN_PX, 22);
  const heightOf = (ks: typeof keep) => ks.reduce((a, k) => a + (k === 'foot' ? foot * 1.6 : linesHeight(lines[k])), 0);
  const minBig = Math.max(MIN_PX * 2, box.h * 0.3);
  while (keep.length && box.h - heightOf(keep) < minBig) keep = keep.slice(0, -1);
  const maxBig = Math.min(box.h - heightOf(keep), box.h * 0.5, 160) / 1.08;
  const big = unitBelow
    ? kit.fitSize(g, f.price, box.w, { size: Math.max(MIN_PX, Math.round(maxBig)), family: theme.fonts.sansBold }, MIN_PX)
    : bigSize(g, ctx, f.price, box.w, maxBig, unit);
  // A tall tile: the text at the top, the next hours as bars under it.
  const tall = box.h >= box.w * 1.25 && box.h >= 200;
  const top = tall ? box.y : box.y + (box.h - heightOf(keep) - big * 1.08) / 2;
  const has = (k: (typeof keep)[number]) => keep.includes(k);
  let y = top;
  if (has('head')) {
    drawLines(g, ctx, lines.head, box.x, y, box.w);
    y += linesHeight(lines.head);
  }
  if (unitBelow) kit.drawTracked(g, f.price, box.x, y + big * 0.9, { size: big, family: theme.fonts.sansBold, color });
  else drawBig(g, ctx, f.price, color, box.x, y + big * 0.9, big, unit);
  y += big * 1.08;
  if (has('level')) {
    const l = lines.level[0]!;
    const fl = { size: l.size, family: theme.fonts.sansBold, color };
    const base = y + l.size;
    const w = kit.drawTracked(g, kit.truncate(g, l.text, box.w, fl), box.x, base, fl);
    if (unitBelow) {
      const fu = { size: unit, family: theme.fonts.sans, color: c.inkDim };
      const text = ` · ${UNIT}`;
      if (w + kit.measureTracked(g, text, fu) <= box.w) kit.drawTracked(g, text, box.x + w, base, fu);
    }
    y += linesHeight(lines.level);
  }
  const after: Line[] = [...(has('next') ? lines.next : []), ...(has('minMax') ? lines.minMax : [])];
  drawLines(g, ctx, after, box.x, y, box.w);
  y += linesHeight(after);
  const footY = tall ? box.y + box.h - foot * 0.35 : Math.min(box.y + box.h - foot * 0.35, y + foot * 1.6 - foot * 0.35);
  if (has('foot')) drawSourceLine(g, ctx, data, footY, foot);
  if (tall) {
    const stripTop = y + s * 0.9;
    const stripBottom = has('foot') ? footY - foot * 1.5 : box.y + box.h;
    if (stripBottom - stripTop >= 48) drawStrip(g, ctx, data, { x: box.x, y: stripTop, w: box.w, h: stripBottom - stripTop }, s);
  }
}

/** The next hours as small bars, this one first and marked, with a few hour labels under them. */
function drawStrip(g: Graphics, ctx: Ctx, data: PriceData, area: { x: number; y: number; w: number; h: number }, s: number): void {
  const { kit, theme } = ctx;
  const c = theme.colors;
  const all = hourly(data.slots);
  const levels = levelsOf(all, data.zone);
  const from = Math.floor(ctx.now / 3_600_000) * 3_600_000;
  const n = Math.min(12, Math.max(4, Math.floor(area.w / 11)));
  const hours = all.filter((h) => h.start >= from).slice(0, n);
  if (hours.length < 2) return;
  const font = { size: s, family: theme.fonts.sans, color: c.inkFaint };
  const labelH = Math.round(s * 1.5);
  const barsH = area.h - labelH;
  const max = Math.max(...hours.map((h) => h.price));
  const bw = area.w / n;
  const gap = Math.max(1, Math.round(bw * 0.18));
  hours.forEach((h, i) => {
    const bh = Math.max(2, (h.price / (max || 1)) * barsH * 0.9);
    const x = area.x + i * bw;
    g.save();
    g.fillStyle = levelColor(ctx, levels.get(h.start) ?? 'normal');
    g.fillRect(x + gap / 2, area.y + barsH - bh, bw - gap, bh);
    if (i === 0) {
      // This hour: a line of ink under its bar.
      g.fillStyle = c.ink;
      g.fillRect(x + gap / 2, area.y + barsH + 2, bw - gap, 2);
    }
    g.restore();
  });
  // Hour labels: the first and every few, as far as they fit.
  const h12 = ctx.fmt.hour12;
  const w1 = kit.measureTracked(g, hourLabel(ctx.locale, data.zone, h12, hours[0]!.start), font);
  const step = [1, 2, 3, 4, 6].find((k) => k * bw >= w1 * 1.4) ?? 6;
  let lastRight = -Infinity;
  for (let i = 0; i < hours.length; i += step) {
    const text = hourLabel(ctx.locale, data.zone, h12, hours[i]!.start);
    const tw = kit.measureTracked(g, text, font);
    const x = Math.min(area.x + area.w - tw, Math.max(area.x, area.x + i * bw + bw / 2 - tw / 2));
    if (x < lastRight + s * 0.4) continue;
    kit.drawTracked(g, text, x, area.y + area.h - labelH * 0.12, font);
    lastRight = x + tw;
  }
}

export const now = defineWidget({
  id: 'now',
  name: L('Electricity price now', 'Precio de la luz ahora', 'Strompreis jetzt', '当前电价', '目前電價'),
  description: L(
    "This hour's electricity price, big, in green, grey or amber as it ranks among today's hours (cheapest third, middle, dearest third), and when the next cheap stretch starts.",
    'El precio de la luz de esta hora, grande, en verde, gris o ámbar según dónde quede entre las horas de hoy (el tercio más barato, el del medio, el más caro), y cuándo empieza el próximo tramo barato.',
    'Der Strompreis dieser Stunde, groß, in Grün, Grau oder Gelb, je nachdem, wo er unter den Stunden des Tages liegt (günstigstes, mittleres, teuerstes Drittel), und wann der nächste günstige Abschnitt beginnt.',
    '这一小时的电价，大字显示，按在今天各小时中的排位以绿色、灰色或琥珀色标示（最便宜的三分之一、中间、最贵的三分之一），并显示下一个便宜时段何时开始。',
    '這一小時的電價，大字顯示，依在今天各小時中的排位以綠色、灰色或琥珀色標示（最便宜的三分之一、中間、最貴的三分之一），並顯示下一個便宜時段何時開始。',
  ),
  icon: 'zap',
  category: 'info',
  tags: ['electricity', 'energy', 'prices', 'pvpc', 'luz'],
  size: { min: { w: 120, h: 30 }, preferred: { w: 320, h: 200 } },
  sources: [SOURCE],
  options: t.object({
    showNext: t.boolean({ default: true, label: L('Show the next cheap stretch', 'Mostrar el próximo tramo barato', 'Nächsten günstigen Abschnitt zeigen', '显示下一个便宜时段', '顯示下一個便宜時段') }),
  }),
  redraw: 'minute',
  /** No price for this moment (the prices kept are of another day): the "no prices for today" message. */
  empty: ({ sources, now: at }) => {
    const d = dataOf(sources);
    return !!d && !slotAt(d.slots, at);
  },
  render(g, ctx) {
    clipped(g, ctx, () => render(g, ctx));
  },
  demo: ({ now: at }) => ({ sources: { [SOURCE]: demoData(at) } }),
});
