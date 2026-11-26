/** The PVPC's territories: REE's geo ids and their clocks. */
export type Geo = 'peninsula' | 'canarias' | 'baleares' | 'ceuta' | 'melilla';

export const GEOS: readonly Geo[] = ['peninsula', 'canarias', 'baleares', 'ceuta', 'melilla'];

/** REE's id of each territory, the same in REData and ESIOS. */
export const GEO_IDS: Record<Geo, number> = { peninsula: 8741, canarias: 8742, baleares: 8743, ceuta: 8744, melilla: 8745 };

/**
 * The clock the territory lives by. The Canary Islands are one hour behind
 * the Península all year (both change for summer time at the same instant).
 */
export const ZONES: Record<Geo, string> = {
  peninsula: 'Europe/Madrid',
  canarias: 'Atlantic/Canary',
  baleares: 'Europe/Madrid',
  ceuta: 'Europe/Madrid',
  melilla: 'Europe/Madrid',
};

export const geoOf = (v: string): Geo => ((GEOS as readonly string[]).includes(v) ? (v as Geo) : 'peninsula');
