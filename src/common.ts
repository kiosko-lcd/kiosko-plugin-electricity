/** What the three widgets share: their source, colours, messages and REE's credit line. */
import type { Graphics, RenderContext } from '@kiosko/sdk';
import { clock } from './format.ts';
import { fill, OLD, SOURCE_LINE } from './labels.ts';
import type { Level, PriceData } from './types.ts';

export const SOURCE = 'electricity/prices';
/** The smallest text drawn, in px of the box: readable on a panel across the desk. */
export const MIN_PX = 11;

export type Ctx = RenderContext<any, any>;

export const dataOf = (sources: Record<string, unknown>): PriceData | undefined => sources[SOURCE] as PriceData | undefined;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Green, grey, amber: cheap, normal, expensive. */
export function levelColor(ctx: Pick<Ctx, 'theme'>, level: Level): string {
  const c = ctx.theme.colors;
  return level === 'cheap' ? c.ok : level === 'expensive' ? c.warn : c.inkDim;
}

/** The colour of a price as text: like the bar, but plain ink when normal (grey text is hard to read). */
export function levelInk(ctx: Pick<Ctx, 'theme'>, level: Level): string {
  return level === 'normal' ? ctx.theme.colors.ink : levelColor(ctx, level);
}

/** Paints inside the box only, whatever happens. */
export function clipped(g: Graphics, ctx: Ctx, paint: () => void): void {
  const { box } = ctx;
  g.save();
  g.beginPath();
  g.rect(box.x, box.y, box.w, box.h);
  g.clip();
  try {
    paint();
  } finally {
    g.restore();
  }
}

export function drawMessage(g: Graphics, ctx: Ctx, text: string, sub?: string): void {
  const { box, kit, theme } = ctx;
  const c = theme.colors;
  const size = clamp(Math.round(Math.min(box.h * 0.3, box.w / 12)), MIN_PX, 30);
  const subSize = clamp(Math.round(size * 0.62), MIN_PX, 20);
  const showSub = !!sub && box.h >= size * 1.4 + subSize * 1.6;
  const blockH = showSub ? size + subSize * 1.5 : size;
  const top = box.y + (box.h - blockH) / 2;
  const font = { size, family: theme.fonts.sans, color: c.inkDim };
  kit.drawTracked(g, kit.truncate(g, text, box.w, font), box.x, top + size * 0.85, font);
  if (showSub) {
    const f2 = { size: subSize, family: theme.fonts.sans, color: c.inkFaint };
    kit.drawTracked(g, kit.truncate(g, sub!, box.w, f2), box.x, top + size + subSize * 1.2, f2);
  }
}

const dates = new Map<string, Intl.DateTimeFormat>();

/** "24 nov" in the panel's language, on the territory's calendar. */
export function shortDate(locale: string, zone: string, at: number): string {
  const key = `${locale}|${zone}`;
  let f = dates.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: zone });
    } catch {
      f = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: zone });
    }
    dates.set(key, f);
  }
  return f.format(at);
}

/**
 * "Red Eléctrica · 24 nov 20:46": the publisher's terms (REE's) ask to name
 * them as the source and to give the date of the data's last update. "not updated"
 * when the last fetch failed.
 */
export function sourceLine(ctx: Ctx, data: PriceData): string {
  const at = data.updated ?? data.fetchedAt;
  const when = `${shortDate(ctx.locale, data.zone, at)} ${clock(ctx.locale, data.zone, ctx.fmt.hour12, at)}`;
  const line = fill(ctx.t(SOURCE_LINE), { who: data.credit, at: when });
  return data.stale ? `${line} · ${ctx.t(OLD)}` : line;
}

/** The source line at the bottom of the box, small and faint; returns the height it took (0 if no room). */
export function drawSourceLine(g: Graphics, ctx: Ctx, data: PriceData, y: number, size: number, align: 'left' | 'right' = 'left'): void {
  const { box, kit, theme } = ctx;
  const font = { size, family: theme.fonts.sans, color: data.stale ? theme.colors.warn : theme.colors.inkFaint, align };
  kit.drawTracked(g, kit.truncate(g, sourceLine(ctx, data), box.w, font), align === 'right' ? box.x + box.w : box.x, y, font);
}
