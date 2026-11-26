/**
 * Prices and times written the way the panel's language writes them: the
 * number with Intl in its locale ("0,196" in Spanish, "0.196" in English),
 * times on the territory's clock and the user's 12/24-hour choice.
 */

const numbers = new Map<string, Intl.NumberFormat>();
const times = new Map<string, Intl.DateTimeFormat>();

function numberFormat(locale: string, digits: number): Intl.NumberFormat {
  const key = `${locale}|${digits}`;
  let f = numbers.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      f = new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    numbers.set(key, f);
  }
  return f;
}

/** `0,196` / `0.196`: €/kWh with three decimals (a tenth of a cent). */
export function priceText(locale: string, price: number, digits = 3): string {
  return numberFormat(locale, digits).format(price);
}

export const UNIT = '€/kWh';

/** `0,196 €/kWh`. */
export function priceWithUnit(locale: string, price: number, digits = 3): string {
  return `${priceText(locale, price, digits)} ${UNIT}`;
}

function timeFormat(locale: string, zone: string, hour12: boolean, hourOnly: boolean): Intl.DateTimeFormat {
  const key = `${locale}|${zone}|${hour12}|${hourOnly}`;
  let f = times.get(key);
  if (!f) {
    const o: Intl.DateTimeFormatOptions = hourOnly ? { hour: 'numeric', timeZone: zone, hourCycle: hour12 ? 'h12' : 'h23' } : { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', timeZone: zone, hourCycle: hour12 ? 'h12' : 'h23' };
    try {
      f = new Intl.DateTimeFormat(locale, o);
    } catch {
      f = new Intl.DateTimeFormat('en', o);
    }
    times.set(key, f);
  }
  return f;
}

/** `14:00` / `2:00 PM`, on the territory's clock. */
export function clock(locale: string, zone: string, hour12: boolean, at: number): string {
  return timeFormat(locale, zone, hour12, false).format(at);
}

/**
 * `14:00–16:00`; on a 12-hour clock both ends whole, `12:00 AM–6:00 AM`, so
 * midnight and noon are never ambiguous (`下午2:00–下午4:00` in Chinese).
 */
export function clockRange(locale: string, zone: string, hour12: boolean, from: number, to: number): string {
  return `${clock(locale, zone, hour12, from)}–${clock(locale, zone, hour12, to)}`;
}

/** The hour alone for an axis: `14` on a 24-hour clock, `2 PM` on a 12-hour one. */
export function hourLabel(locale: string, zone: string, hour12: boolean, at: number): string {
  if (!hour12) return String(Number(timeFormat(locale, zone, false, false).formatToParts(at).find((p) => p.type === 'hour')?.value ?? '0'));
  return timeFormat(locale, zone, true, true).format(at);
}
