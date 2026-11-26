/**
 * REE's answers turned into price periods. Both APIs give €/MWh with an ISO
 * time and its offset for the start of each period; hourly today, and
 * quarter-hourly if REE ever publishes the PVPC that way (the step is read
 * from the data, not assumed).
 *
 * The Canary Islands: REE publishes their PVPC by clock hour, the same
 * prices as the Península's for the same hour, labelled with the
 * Península's offset. Hour "00:00" there is midnight in Canary time, one
 * real hour after the Península's: `shiftMs` moves it.
 */
import type { Slot } from '../../types.ts';
import type { Geo } from './geo.ts';

/** The Canary Islands' clock is one hour behind the Península's, all year. */
export const shiftOf = (geo: Geo): number => (geo === 'canarias' ? 3_600_000 : 0);

interface RawValue {
  value?: unknown;
  datetime?: unknown;
  geo_id?: unknown;
}

const STEPS = [15, 30, 60];

/** Values (start, €/MWh) into periods in €/kWh, sorted, with each one's length from the spacing of the data. */
export function toSlots(values: { start: number; mwh: number }[]): Slot[] {
  const byStart = new Map<number, number>();
  for (const v of values) if (Number.isFinite(v.start) && Number.isFinite(v.mwh)) byStart.set(v.start, v.mwh);
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  // The usual step: the most common gap between consecutive starts (a gap of missing data is longer).
  const count = new Map<number, number>();
  for (let i = 1; i < starts.length; i++) {
    const m = Math.round((starts[i]! - starts[i - 1]!) / 60_000);
    if (STEPS.includes(m)) count.set(m, (count.get(m) ?? 0) + 1);
  }
  const step = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 60;
  return starts.map((start, i) => {
    const next = starts[i + 1];
    const gap = next === undefined ? step : Math.round((next - start) / 60_000);
    return { start, minutes: Math.min(gap, step), price: Math.round(byStart.get(start)! * 100) / 100_000 };
  });
}

export interface Parsed {
  slots: Slot[];
  /** The data's "last update", epoch ms. */
  updated: number | null;
}

const time = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN);

/**
 * REData's `mercados/precios-mercados-tiempo-real`: a JSON:API document whose
 * `included` has the PVPC (id 1001) and, some days, the spot market price.
 */
export function parseRedata(doc: unknown, geo: Geo): Parsed {
  const d = doc as { data?: { attributes?: { 'last-update'?: unknown } }; included?: { id?: unknown; type?: unknown; attributes?: { values?: RawValue[]; 'last-update'?: unknown } }[]; errors?: { detail?: string }[] };
  if (d?.errors?.length) throw new Error(`REData: ${d.errors.map((e) => e.detail ?? 'error').join('; ')}`);
  const pvpc = d?.included?.find((i) => String(i.id) === '1001' || i.type === 'PVPC');
  if (!pvpc?.attributes?.values) throw new Error('REData: no PVPC in the answer');
  const shift = shiftOf(geo);
  const slots = toSlots(pvpc.attributes.values.map((v) => ({ start: time(v.datetime) + shift, mwh: Number(v.value) })));
  const updated = time(pvpc.attributes['last-update'] ?? d.data?.attributes?.['last-update']);
  return { slots, updated: Number.isFinite(updated) ? updated : null };
}

/** ESIOS's `indicators/1001` (PVPC 2.0TD energy term): every territory's values in one list, by `geo_id`. */
export function parseEsios(doc: unknown, geo: Geo, geoId: number): Parsed {
  const d = doc as { indicator?: { values?: RawValue[]; values_updated_at?: unknown } };
  const values = d?.indicator?.values;
  if (!Array.isArray(values)) throw new Error('ESIOS: no values in the answer');
  const mine = values.filter((v) => v.geo_id === undefined || Number(v.geo_id) === geoId);
  const shift = shiftOf(geo);
  const slots = toSlots(mine.map((v) => ({ start: time(v.datetime) + shift, mwh: Number(v.value) })));
  const updated = time(d.indicator?.values_updated_at);
  return { slots, updated: Number.isFinite(updated) ? updated : null };
}
