/** One price period: an hour, or a quarter of an hour where prices come that way. */
export interface Slot {
  /** Epoch ms of its start. */
  start: number;
  /** 60, or 15 for quarter-hourly prices. */
  minutes: number;
  /** €/kWh, as the provider publishes it (for the PVPC: the 2.0TD energy term, before taxes). */
  price: number;
}

/** What the source hands to the widgets. Plain data, the same whatever the provider. */
export interface PriceData {
  /** When this was read. */
  at: number;
  /** The provider (`pvpc`) and its area (`peninsula`). */
  provider: string;
  area: string;
  /** IANA zone of the area: times are shown and days are cut in it. */
  zone: string;
  /** Where the prices came from inside the provider: `redata`, `esios`, `demo`. */
  origin: string;
  /** Who publishes them, as their terms ask to name them: "Red Eléctrica". */
  credit: string;
  /** The publisher's "last update" of the data, epoch ms (shown with the credit). */
  updated: number | null;
  /** When the prices were last fetched. */
  fetchedAt: number;
  /** Every price known from yesterday on, in order. */
  slots: Slot[];
  /** The last fetch failed: these are the prices kept on disk. */
  stale: boolean;
}

/** How a price ranks within its own day. */
export type Level = 'cheap' | 'normal' | 'expensive';

/** A run of consecutive periods: when to run an appliance. */
export interface PriceWindow {
  start: number;
  end: number;
  /** Average €/kWh over the window, weighted by each period's length. */
  avg: number;
}
