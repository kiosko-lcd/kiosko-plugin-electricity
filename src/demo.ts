/**
 * Sample prices for the gallery, the editor and the tests: two real days of
 * the PVPC (Península, 24 and 25 November 2026, from REE) laid on the days
 * around `now`, by clock hour, so a 23- or 25-hour day comes out right.
 * Tomorrow's are there from 20:15 on, as they would be.
 */
import { pvpc } from './providers/pvpc/index.ts';
import { addDays, localDate, localMinutes, startOfDay } from './time.ts';
import type { PriceData, Slot } from './types.ts';

/** €/MWh by clock hour: a sunny day (cheap at noon) and a windless winter one. */
const SUNNY = [166.11, 134.22, 103.89, 105.37, 103.12, 102.4, 109.39, 188.11, 242.18, 191.82, 178.39, 122.55, 122.67, 122.44, 55.34, 104.94, 172.39, 269.22, 367.27, 375.92, 393.28, 390.22, 299.5, 276.57];
const CLOUDY = [196.5, 198.68, 193.72, 191.05, 190.17, 194.63, 220.82, 239.51, 261.51, 243.43, 302.97, 285.06, 276.23, 275.79, 204.81, 210.24, 215.83, 248.2, 319.64, 322.7, 323.46, 309.73, 212.94, 190.01];

function dayOf(date: string, zone: string, curve: number[]): Slot[] {
  const out: Slot[] = [];
  const end = startOfDay(addDays(date, 1), zone);
  for (let t = startOfDay(date, zone); t < end; t += 3_600_000) {
    const h = Math.floor(localMinutes(t, zone) / 60);
    out.push({ start: t, minutes: 60, price: curve[h]! / 1000 });
  }
  return out;
}

export function demoData(now: number): PriceData {
  const zone = 'Europe/Madrid';
  const today = localDate(now, zone);
  const slots = [...dayOf(addDays(today, -1), zone, CLOUDY), ...dayOf(today, zone, SUNNY)];
  const published = localMinutes(now, pvpc.publish.zone) >= pvpc.publish.from;
  if (published) slots.push(...dayOf(addDays(today, 1), zone, CLOUDY));
  // REE's last update: this evening once tomorrow is in, else last evening (20:46).
  const updated = published ? now - 5 * 60_000 : startOfDay(today, zone) - 3 * 3_600_000 - 14 * 60_000;
  return { at: now, provider: 'pvpc', area: 'peninsula', zone, origin: 'demo', credit: pvpc.credit, updated, fetchedAt: now, slots, stale: false };
}
