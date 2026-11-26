/**
 * Getting the prices without bothering the provider: they change once a
 * day, so the source reads its copy on disk every few minutes and asks the
 * network only when something is missing.
 *
 * - Today's prices missing (first run, a new area, an outage): ask, then
 *   again every 5 minutes until they come.
 * - Tomorrow's: from the time the provider publishes them (for the PVPC,
 *   about 20:15 Spanish time), ask at most every 30 minutes, plus once right
 *   after the usual time they are in (20:30), until they come.
 * - Both in: nothing to ask until the day changes.
 *
 * If the provider fails, the copy on disk is used and marked stale.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HttpClient } from '@kiosko/sdk';
import type { PriceProvider, ProviderOptions } from './providers/provider.ts';
import { dayComplete } from './prices.ts';
import { addDays, atLocal, localDate, localMinutes, startOfDay } from './time.ts';
import type { PriceData, Slot } from './types.ts';

/** Ask for tomorrow at most this often. */
export const TOMORROW_EVERY_MS = 30 * 60_000;
/** Ask for missing prices of today at most this often. */
export const RETRY_MS = 5 * 60_000;

/** What is kept on disk, one file per territory. */
export interface Cached {
  version: 1;
  provider: string;
  area: string;
  /** Which of the provider's APIs answered. */
  origin: string;
  updated: number | null;
  /** Last time prices came back. */
  fetchedAt: number;
  /** Last time the network was asked, whatever the answer. */
  attemptAt: number;
  slots: Slot[];
}

export interface Store {
  load(provider: string, area: string): Promise<Cached | undefined>;
  save(c: Cached): Promise<void>;
}

/** The prices on disk, in `dir/prices-<provider>-<area>.json`, kept in memory too. Written only when they change. */
export function fileStore(dir: string): Store {
  const memory = new Map<string, Cached>();
  const key = (provider: string, area: string) => `${provider}-${area}`.replace(/[^\w.-]/g, '_');
  const file = (k: string) => join(dir, `prices-${k}.json`);
  return {
    async load(provider, area) {
      const k = key(provider, area);
      const m = memory.get(k);
      if (m) return m;
      try {
        const c = JSON.parse(await readFile(file(k), 'utf8')) as Cached;
        if (c?.version !== 1 || c.provider !== provider || c.area !== area || !Array.isArray(c.slots)) return undefined;
        memory.set(k, c);
        return c;
      } catch {
        return undefined;
      }
    },
    async save(c) {
      const k = key(c.provider, c.area);
      const before = memory.get(k);
      memory.set(k, c);
      // Only the attempt time changed: keep it in memory, don't rewrite the file.
      if (before && JSON.stringify({ ...before, attemptAt: 0 }) === JSON.stringify({ ...c, attemptAt: 0 })) return;
      await mkdir(dir, { recursive: true });
      const tmp = `${file(k)}.tmp`;
      await writeFile(tmp, JSON.stringify(c));
      await rename(tmp, file(k));
    },
  };
}

/** Whether to ask the network now, and why (for the log and the tests). */
export function planFetch(c: Cached | undefined, now: number, zone: string, publish: PriceProvider['publish']): { fetch: boolean; why: string } {
  const today = localDate(now, zone);
  if (!c) return { fetch: true, why: 'nothing on disk' };
  const since = now - c.attemptAt;
  if (!dayComplete(c.slots, today, zone)) return since >= RETRY_MS ? { fetch: true, why: 'today missing' } : { fetch: false, why: 'today missing, retrying soon' };
  if (dayComplete(c.slots, addDays(today, 1), zone)) return { fetch: false, why: 'today and tomorrow in' };
  // Tomorrow comes out by the publisher's clock (the Península's, for the Canary Islands too).
  const minutes = localMinutes(now, publish.zone);
  if (minutes < publish.from) return { fetch: false, why: 'tomorrow not published yet' };
  const by = atLocal(localDate(now, publish.zone), publish.by, publish.zone);
  if (now >= by && c.attemptAt < by) return { fetch: true, why: 'tomorrow: right after it is usually out' };
  return since >= TOMORROW_EVERY_MS ? { fetch: true, why: 'tomorrow missing' } : { fetch: false, why: 'tomorrow missing, asked recently' };
}

export interface FetchDeps {
  http: HttpClient;
  store: Store;
}

export interface FetchCtx {
  now: number;
  signal?: AbortSignal;
  log?: (m: string) => void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Merges new periods over the old ones (the newest wins), dropping what is older than yesterday. */
export function mergeSlots(old: readonly Slot[], fresh: readonly Slot[], keepFrom: number): Slot[] {
  const by = new Map<number, Slot>();
  for (const s of old) by.set(s.start, s);
  for (const s of fresh) by.set(s.start, s);
  return [...by.values()].filter((s) => s.start >= keepFrom).sort((a, b) => a.start - b.start);
}

/** One read of the source: from disk, from the network when the plan says so. */
export async function readPrices(provider: PriceProvider, o: ProviderOptions, ctx: FetchCtx, deps: FetchDeps): Promise<PriceData> {
  const zone = provider.zone(o);
  const area = provider.area(o);
  const today = localDate(ctx.now, zone);
  const keepFrom = startOfDay(addDays(today, -1), zone);
  let c = await deps.store.load(provider.id, area);
  const plan = planFetch(c, ctx.now, zone, provider.publish);
  let stale = false;
  if (plan.fetch) {
    try {
      const got = await provider.download(o, today, { http: deps.http, ...(ctx.signal ? { signal: ctx.signal } : {}), ...(ctx.log ? { log: ctx.log } : {}) });
      c = {
        version: 1,
        provider: provider.id,
        area,
        origin: got.origin,
        updated: got.updated ?? c?.updated ?? null,
        fetchedAt: ctx.now,
        attemptAt: ctx.now,
        slots: mergeSlots(c?.slots ?? [], got.slots, keepFrom),
      };
    } catch (err) {
      ctx.log?.(`${provider.id} (${plan.why}): ${message(err)}`);
      if (!c) throw err;
      c = { ...c, attemptAt: ctx.now };
      stale = !dayComplete(c.slots, today, zone);
    }
    try {
      await deps.store.save(c);
    } catch (err) {
      ctx.log?.(`${provider.id}: could not keep the prices: ${message(err)}`);
    }
  }
  if (!c) throw new Error('no prices');
  const slots = c.slots.filter((s) => s.start >= keepFrom);
  if (!slots.some((s) => s.start >= startOfDay(today, zone))) {
    throw new Error(stale ? `${provider.credit} did not answer and there are no prices for today on disk` : 'no prices for today yet');
  }
  return { at: ctx.now, provider: provider.id, area, zone, origin: c.origin, credit: provider.credit, updated: c.updated, fetchedAt: c.fetchedAt, slots, stale };
}
