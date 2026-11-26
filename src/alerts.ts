/**
 * Two optional full-screen alerts, off by default:
 *
 * - The day's cheapest run of N hours starts: "Cheapest 2 h of the day: now".
 *   One per day (its id is the window's start), gone when the window ends.
 * - The price goes over a threshold the user sets: one per stretch over it,
 *   gone when the stretch ends.
 *
 * Both say who publishes the prices (REE for the PVPC), as their terms ask.
 */
import type { Alert } from '@kiosko/sdk';
import { clockRange } from './format.ts';
import { L } from './i18n.ts';
import { aboveUntil, cheapestOfDay, slotAt } from './prices.ts';
import { providerOf } from './providers/index.ts';
import { localDate } from './time.ts';
import type { PriceData } from './types.ts';

export interface AlertOptions {
  alertCheapest: boolean;
  alertDurationMs: number;
  alertAbove: number;
}

/** Alerts are painted in every language: times on a 24-hour clock, prices with a comma or a point by language. */
const both = (fn: (locale: string) => string) => L(fn('en'), fn('es'), fn('de'), fn('zh-Hans'), fn('zh-Hant'));
const num = (locale: string, p: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(p);

export function priceAlerts(data: PriceData | undefined, o: AlertOptions, now: number): Alert[] {
  if (!data) return [];
  const out: Alert[] = [];
  // Who publishes the prices, as their terms ask ("REE").
  const who = providerOf(data.provider).shortCredit;
  const range = (a: number, b: number) => clockRange('en', data.zone, false, a, b);
  if (o.alertCheapest) {
    const minutes = Math.max(60, Math.min(240, Math.round(o.alertDurationMs / 900_000) * 15));
    const w = cheapestOfDay(data.slots, localDate(now, data.zone), data.zone, minutes);
    if (w && w.start <= now && now < w.end) {
      const h = `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}`;
      const zh = (hour: string, min: string) => `${Math.floor(minutes / 60)} ${hour}${minutes % 60 ? ` ${minutes % 60} ${min}` : ''}`;
      out.push({
        id: `cheapest-${data.provider}-${data.area}-${minutes}-${w.start}`,
        level: 'info',
        icon: 'zap',
        title: L(`Cheapest ${h} of the day: now`, `Las ${h} más baratas del día: ahora`, `Günstigste ${h} des Tages: jetzt`, `今天最便宜的 ${zh('小时', '分')}：现在`, `今天最便宜的 ${zh('小時', '分')}：現在`),
        text: both((l) => `${range(w.start, w.end)} · ${num(l, w.avg)} €/kWh`),
        source: who,
        expiresAt: w.end,
      });
    }
  }
  if (o.alertAbove > 0) {
    const run = aboveUntil(data.slots, now, o.alertAbove);
    const cur = slotAt(data.slots, now);
    if (run && cur) {
      out.push({
        id: `above-${data.provider}-${data.area}-${o.alertAbove}-${run.start}`,
        level: 'warn',
        icon: 'zap',
        title: both((l) =>
          ({
            en: `Electricity over ${num(l, o.alertAbove)} €/kWh`,
            es: `La luz, por encima de ${num(l, o.alertAbove)} €/kWh`,
            de: `Strom über ${num(l, o.alertAbove)} €/kWh`,
            'zh-Hans': `电价高于 ${num(l, o.alertAbove)} 欧元/千瓦时`,
            'zh-Hant': `電價高於 ${num(l, o.alertAbove)} 歐元/千瓦時`,
          })[l]!,
        ),
        text: both((l) => `${num(l, cur.price)} €/kWh · ${range(run.start, run.end)}`),
        source: who,
        expiresAt: run.end,
      });
    }
  }
  return out;
}
