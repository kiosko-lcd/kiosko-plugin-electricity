/**
 * `electricity/chart`: the day's prices as bars, green, grey or amber by how each
 * ranks in its day, the hour now marked, and tomorrow's once published. In
 * a tall narrow tile, one row per hour from now on.
 */
import { defineWidget, t, type Graphics } from '@kiosko/sdk';
import { clamp, clipped, dataOf, drawMessage, levelColor, levelInk, MIN_PX, sourceLine, SOURCE, type Ctx } from './common.ts';
import { demoData } from './demo.ts';
import { hourLabel, priceText, UNIT } from './format.ts';
import { L } from './i18n.ts';
import { NO_TODAY, NOW, TOMORROW, WAITING } from './labels.ts';
import { daySlots, levelsOf, slotAt, slotEnd } from './prices.ts';
import { addDays, localDate, localMinutes, startOfDay } from './time.ts';
import type { Level, PriceData, Slot } from './types.ts';

export type Span = 'auto' | 'today' | 'both' | 'next24';

/** The periods to draw and the time they span. */
export function spanOf(data: PriceData, now: number, span: Span, wide: boolean): { slots: Slot[]; from: number; to: number } {
  const { zone } = data;
  const today = localDate(now, zone);
  const tomorrow = addDays(today, 1);
  const tSlots = daySlots(data.slots, today, zone);
  const mSlots = daySlots(data.slots, tomorrow, zone);
  const mode = span === 'auto' ? (mSlots.length ? (wide ? 'both' : 'next24') : 'today') : span;
  const dayEnd = startOfDay(tomorrow, zone);
  if (mode === 'both' && mSlots.length) return { slots: [...tSlots, ...mSlots], from: startOfDay(today, zone), to: startOfDay(addDays(tomorrow, 1), zone) };
  if (mode === 'next24') {
    const cur = slotAt(data.slots, now);
    const from = cur ? Math.floor(cur.start / 3_600_000) * 3_600_000 : now;
    const slots = data.slots.filter((s) => s.start >= from && s.start < from + 24 * 3_600_000);
    if (slots.length) return { slots, from, to: Math.max(from + 24 * 3_600_000, slotEnd(slots[slots.length - 1]!)) };
  }
  return { slots: tSlots, from: startOfDay(today, zone), to: dayEnd };
}

/** Hourly averages, for rows (quarter-hours would be too thin to read). */
export function hourly(slots: readonly Slot[]): Slot[] {
  const by = new Map<number, Slot[]>();
  for (const s of slots) {
    const h = Math.floor(s.start / 3_600_000) * 3_600_000;
    let list = by.get(h);
    if (!list) by.set(h, (list = []));
    list.push(s);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([start, list]) => {
    const m = list.reduce((a, s) => a + s.minutes, 0);
    return { start, minutes: Math.max(60, m), price: list.reduce((a, s) => a + s.price * s.minutes, 0) / m };
  });
}

function drawBars(g: Graphics, ctx: Ctx, data: PriceData, span: Span): void {
  const { box, kit, theme } = ctx;
  const c = theme.colors;
  const { zone } = data;
  const view = spanOf(data, ctx.now, span, box.w >= 360);
  const levels = levelsOf(data.slots, zone);
  const cur = slotAt(data.slots, ctx.now);
  const s = clamp(Math.round(Math.min(box.h * 0.085, box.w / 26)), MIN_PX, 18);
  const labels = box.h >= 70;
  const topH = labels ? Math.round(s * 1.6) : 0;
  const axisH = labels ? Math.round(s * 1.5) : 0;
  const footH = labels && box.h >= 150 ? Math.round(s * 1.4) : 0;
  const area = { x: box.x, y: box.y + topH, w: box.w, h: box.h - topH - axisH - footH };
  const prices = view.slots.map((x) => x.price);
  const max = Math.max(...prices);
  const base = Math.min(0, ...prices);
  const xOf = (at: number) => area.x + ((at - view.from) / (view.to - view.from)) * area.w;
  const yOf = (p: number) => area.y + area.h - ((p - base) / (max - base || 1)) * area.h;
  // A faint line at the top price, with its value.
  g.save();
  g.strokeStyle = c.surfaceEdge;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(area.x, Math.round(yOf(max)) + 0.5);
  g.lineTo(area.x + area.w, Math.round(yOf(max)) + 0.5);
  g.moveTo(area.x, Math.round(area.y + area.h) + 0.5);
  g.lineTo(area.x + area.w, Math.round(area.y + area.h) + 0.5);
  g.stroke();
  g.restore();
  const tomorrowStart = startOfDay(addDays(localDate(ctx.now, zone), 1), zone);
  for (const sl of view.slots) {
    const x0 = xOf(sl.start);
    const x1 = xOf(slotEnd(sl));
    const bw = x1 - x0;
    const gap = bw >= 5 ? Math.max(1, Math.round(bw * 0.16)) : 0;
    const level: Level = levels.get(sl.start) ?? 'normal';
    const past = slotEnd(sl) <= ctx.now;
    const isNow = cur?.start === sl.start;
    const top = Math.min(yOf(sl.price), area.y + area.h - 2);
    g.save();
    g.globalAlpha = past ? 0.32 : 1;
    g.fillStyle = levelColor(ctx, level);
    g.fillRect(x0 + gap / 2, top, Math.max(1, bw - gap), area.y + area.h - top);
    g.restore();
    if (isNow) {
      // A notch over the bar of now, in ink.
      const mx = (x0 + x1) / 2;
      const tri = clamp(Math.round(Math.max(bw * 0.5, s * 0.45)), 4, 12);
      g.save();
      g.fillStyle = c.ink;
      g.beginPath();
      g.moveTo(mx - tri / 2, top - tri - 2);
      g.lineTo(mx + tri / 2, top - tri - 2);
      g.lineTo(mx, top - 2);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  // Midnight between today and tomorrow.
  if (tomorrowStart > view.from && tomorrowStart < view.to) {
    const x = Math.round(xOf(tomorrowStart)) + 0.5;
    g.save();
    g.strokeStyle = c.inkFaint;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(x, box.y + (labels ? 2 : 0));
    g.lineTo(x, area.y + area.h);
    g.stroke();
    g.restore();
    if (labels) {
      const font = { size: s, family: theme.fonts.sans, color: c.inkDim };
      const room = box.x + box.w - x - s * 0.4;
      if (room > s * 3) kit.drawTracked(g, kit.truncate(g, ctx.t(TOMORROW), room, font), x + s * 0.4, box.y + s, font);
    }
  }
  if (!labels) return;
  // Top left: the top price and the unit; then "Now 0,276" if it fits before tomorrow's label.
  const maxText = `${priceText(ctx.locale, max)} ${UNIT}`;
  const fMax = { size: s, family: theme.fonts.sans, color: c.inkDim };
  const maxW = kit.measureTracked(g, maxText, fMax);
  const leftRoom = (tomorrowStart > view.from && tomorrowStart < view.to ? xOf(tomorrowStart) : box.x + box.w) - box.x - s * 0.6;
  if (maxW <= leftRoom) kit.drawTracked(g, maxText, box.x, box.y + s, fMax);
  if (cur) {
    const lvl = levels.get(cur.start) ?? 'normal';
    const nowText = `${ctx.t(NOW)} ${priceText(ctx.locale, cur.price)}`;
    const fNow = { size: s, family: theme.fonts.sansBold, color: levelInk(ctx, lvl) };
    const w = kit.measureTracked(g, nowText, fNow);
    const x = box.x + maxW + s * 1.2;
    if (x + w <= box.x + leftRoom) kit.drawTracked(g, nowText, x, box.y + s, fNow);
    else if (tomorrowStart > view.from && tomorrowStart < view.to) {
      // No room before tomorrow's label: at the right end, if it clears that label.
      const labelEnd = xOf(tomorrowStart) + s * 0.4 + kit.measureTracked(g, ctx.t(TOMORROW), { size: s, family: theme.fonts.sans });
      if (labelEnd + s <= box.x + box.w - w) kit.drawTracked(g, nowText, box.x + box.w, box.y + s, { ...fNow, align: 'right' });
    }
  }
  // Hours under the bars, as often as they fit.
  const fAxis = { size: s, family: theme.fonts.sans, color: c.inkFaint };
  const h12 = ctx.fmt.hour12;
  const labelW = kit.measureTracked(g, hourLabel(ctx.locale, zone, h12, Date.UTC(2026, 0, 1, 11)), fAxis);
  const perHour = area.w / ((view.to - view.from) / 3_600_000);
  const step = [1, 2, 3, 4, 6, 12, 24].find((n) => n * perHour >= labelW * 1.5) ?? 24;
  let lastRight = -Infinity;
  for (let at = Math.ceil(view.from / 3_600_000) * 3_600_000; at < view.to; at += 3_600_000) {
    const m = localMinutes(at, zone);
    if (m % 60 !== 0 || (m / 60) % step !== 0) continue;
    const text = hourLabel(ctx.locale, zone, h12, at);
    const w = kit.measureTracked(g, text, fAxis);
    const x = clamp(xOf(at) + perHour / 2 - w / 2, box.x, box.x + box.w - w);
    if (x < lastRight + s * 0.5) continue;
    kit.drawTracked(g, text, x, area.y + area.h + axisH * 0.82, fAxis);
    lastRight = x + w;
  }
  if (footH) {
    const f = { size: clamp(Math.round(s * 0.85), MIN_PX, 16), family: theme.fonts.sans, color: data.stale ? c.warn : c.inkFaint };
    kit.drawTracked(g, kit.truncate(g, sourceLine(ctx, data), box.w, f), box.x, box.y + box.h - footH * 0.25, f);
  }
}

/** Tall and narrow: one row per hour, from this one on, as many as fit. */
function drawRows(g: Graphics, ctx: Ctx, data: PriceData): void {
  const { box, kit, theme } = ctx;
  const c = theme.colors;
  const { zone } = data;
  const levels = levelsOf(hourly(data.slots), zone);
  const cur = slotAt(data.slots, ctx.now);
  const from = cur ? Math.floor(cur.start / 3_600_000) * 3_600_000 : ctx.now;
  const all = hourly(data.slots).filter((s) => s.start >= from);
  const s = clamp(Math.round(Math.min(box.w / 11, 16)), MIN_PX, 16);
  const footH = box.h >= 200 ? Math.round(s * 1.5) : 0;
  const rowH = Math.max(s + 2, Math.min(s * 2, (box.h - footH) / Math.max(1, all.length)));
  const n = Math.min(all.length, Math.floor((box.h - footH) / rowH));
  const rows = all.slice(0, n);
  const max = Math.max(...rows.map((r) => r.price));
  const h12 = ctx.fmt.hour12;
  const fHour = { size: s, family: theme.fonts.sans, color: c.inkDim };
  const labelW = Math.max(...rows.map((r) => kit.measureTracked(g, hourLabel(ctx.locale, zone, h12, r.start), fHour)));
  const showPrice = box.w >= 140;
  const fPrice = { size: s, family: theme.fonts.sans, color: c.ink, align: 'right' as const };
  const priceW = showPrice ? kit.measureTracked(g, priceText(ctx.locale, 0.888), fPrice) + s * 0.5 : 0;
  const barX = box.x + labelW + s * 0.5;
  const barMax = box.x + box.w - priceW - barX;
  const tomorrow = startOfDay(addDays(localDate(ctx.now, zone), 1), zone);
  rows.forEach((r, i) => {
    const y = box.y + i * rowH;
    const isNow = i === 0 && !!cur;
    const lvl = levels.get(r.start) ?? 'normal';
    if (r.start === tomorrow && i > 0) {
      g.save();
      g.strokeStyle = c.inkFaint;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(box.x, Math.round(y) + 0.5);
      g.lineTo(box.x + box.w, Math.round(y) + 0.5);
      g.stroke();
      g.restore();
    }
    const base = y + rowH / 2 + s * 0.36;
    kit.drawTracked(g, hourLabel(ctx.locale, zone, h12, r.start), box.x, base, { ...fHour, ...(isNow ? { family: theme.fonts.sansBold, color: c.ink } : {}) });
    const bh = Math.max(3, Math.round(rowH * 0.56));
    g.save();
    g.fillStyle = levelColor(ctx, lvl);
    g.fillRect(barX, y + (rowH - bh) / 2, Math.max(2, (r.price / (max || 1)) * barMax), bh);
    g.restore();
    if (showPrice) kit.drawTracked(g, priceText(ctx.locale, r.price), box.x + box.w, base, { ...fPrice, ...(isNow ? { family: theme.fonts.sansBold, color: levelInk(ctx, lvl) } : {}) });
  });
  if (footH) {
    const f = { size: MIN_PX, family: theme.fonts.sans, color: data.stale ? c.warn : c.inkFaint };
    kit.drawTracked(g, kit.truncate(g, sourceLine(ctx, data), box.w, f), box.x, box.y + box.h - footH * 0.3, f);
  }
}

function render(g: Graphics, ctx: Ctx): void {
  const data = dataOf(ctx.sources);
  if (!data) return drawMessage(g, ctx, ctx.t(WAITING));
  if (!daySlots(data.slots, localDate(ctx.now, data.zone), data.zone).length) return drawMessage(g, ctx, ctx.t(NO_TODAY));
  const { box } = ctx;
  if (box.h > box.w * 1.3 && box.w < 360 && box.h >= 120) return drawRows(g, ctx, data);
  drawBars(g, ctx, data, ctx.options.span as Span);
}

export const chart = defineWidget({
  id: 'chart',
  name: L('Electricity prices by hour', 'Precio de la luz por horas', 'Strompreise nach Stunden', '逐小时电价', '逐小時電價'),
  description: L(
    "Today's electricity prices hour by hour, as bars in green, grey or amber, the hour now marked, and tomorrow's beside them once published (for the PVPC, about 20:15). In a tall narrow tile, one row per hour from now on.",
    'El precio de la luz de hoy hora a hora, en barras verdes, grises o ámbar, con la hora actual marcada, y el de mañana al lado en cuanto se publica (el PVPC, hacia las 20:15). En una tesela alta y estrecha, una fila por hora a partir de ahora.',
    'Die Strompreise von heute Stunde für Stunde, als Balken in Grün, Grau oder Gelb, die aktuelle Stunde markiert, und die von morgen daneben, sobald veröffentlicht (beim PVPC gegen 20:15). In einer hohen, schmalen Kachel eine Zeile pro Stunde ab jetzt.',
    '今天逐小时的电价柱状图，以绿色、灰色或琥珀色显示，标出当前小时；明天的电价公布后（PVPC 约 20:15）一并显示。在高而窄的格子里，从现在起每小时一行。',
    '今天逐小時的電價長條圖，以綠色、灰色或琥珀色顯示，標出目前小時；明天的電價公布後（PVPC 約 20:15）一併顯示。在高而窄的方格裡，從現在起每小時一列。',
  ),
  icon: 'chart-column',
  category: 'info',
  tags: ['electricity', 'energy', 'prices', 'pvpc', 'luz'],
  size: { min: { w: 140, h: 40 }, preferred: { w: 480, h: 200 } },
  sources: [SOURCE],
  options: t.object({
    span: t.enum(['auto', 'today', 'both', 'next24'] as const, {
      default: 'auto',
      label: L('Hours shown', 'Horas que se ven', 'Gezeigte Stunden', '显示的时段', '顯示的時段'),
      help: L(
        'Automatic: today, and once tomorrow is published, today and tomorrow (the next 24 hours in a narrow tile).',
        'Automático: hoy y, cuando se publique mañana, hoy y mañana (las próximas 24 horas en una tesela estrecha).',
        'Automatisch: heute und, sobald morgen veröffentlicht ist, heute und morgen (die nächsten 24 Stunden in einer schmalen Kachel).',
        '自动：今天；明天的电价公布后显示今天和明天（窄格子里显示接下来 24 小时）。',
        '自動：今天；明天的電價公布後顯示今天和明天（窄方格裡顯示接下來 24 小時）。',
      ),
      labels: {
        auto: L('Automatic', 'Automático', 'Automatisch', '自动', '自動'),
        today: L('Today', 'Hoy', 'Heute', '今天', '今天'),
        both: L('Today and tomorrow', 'Hoy y mañana', 'Heute und morgen', '今天和明天', '今天和明天'),
        next24: L('Next 24 hours', 'Próximas 24 horas', 'Nächste 24 Stunden', '接下来 24 小时', '接下來 24 小時'),
      },
    }),
  }),
  redraw: 'minute',
  render(g, ctx) {
    clipped(g, ctx, () => render(g, ctx));
  },
  demo: ({ now: at }) => ({ sources: { [SOURCE]: demoData(at) } }),
});
