/**
 * A price provider: where one market's hourly prices come from. The source,
 * its cache and fetch plan, and every widget work with any of them; a new
 * country is a new module here (say a Nord Pool or ENTSO-E area), listed in
 * `providers/index.ts`, with its options added to the source.
 */
import type { HttpClient, Localized } from '@kiosko/sdk';
import type { Slot } from '../types.ts';

/** The source's options, as every provider sees them (each reads its own). */
export interface ProviderOptions {
  provider: string;
  /** PVPC: the Spanish territory. */
  geo: string;
  /** PVPC: an ESIOS token, for the fallback. */
  esiosToken: string;
}

export interface Downloaded {
  slots: Slot[];
  /** The publisher's "last update", epoch ms. */
  updated: number | null;
  /** Which of its APIs answered (`redata`, `esios`). */
  origin: string;
}

export interface PriceProvider {
  id: string;
  /** For the editor: "Spain – PVPC (Red Eléctrica)". */
  name: Localized;
  /** Hosts it contacts (the plugin's `permissions.network`). */
  hosts: string[];
  /** Its area for these options (`peninsula`): a cache file and alert ids per area. */
  area(o: ProviderOptions): string;
  /** The area's time zone: days are cut and times shown on its clock. */
  zone(o: ProviderOptions): string;
  /**
   * When tomorrow's prices come out, in minutes after midnight on `zone`'s
   * clock: asked for from `from`, at most every 30 min, plus once right after `by`.
   */
  publish: { zone: string; from: number; by: number };
  /** Who to name with the prices, as their terms ask ("Red Eléctrica"), and a short form for alerts ("REE"). */
  credit: string;
  shortCredit: string;
  /** Today's and tomorrow's prices (dates on the area's clock); throws when there are none. */
  download(o: ProviderOptions, today: string, ctx: { http: HttpClient; signal?: AbortSignal; log?: (m: string) => void }): Promise<Downloaded>;
}
