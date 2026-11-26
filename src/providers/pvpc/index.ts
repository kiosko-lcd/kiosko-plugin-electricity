/**
 * Spain's PVPC (2.0TD), from Red Eléctrica de España: REData first (public,
 * no key), ESIOS when it fails and the user set a token. Tomorrow's prices
 * come out around 20:15, Península time.
 */
import { addDays } from '../../time.ts';
import type { Downloaded, PriceProvider } from '../provider.ts';
import { GEO_IDS, geoOf, ZONES, type Geo } from './geo.ts';
import { parseEsios, parseRedata } from './parse.ts';

export const REDATA = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';
export const ESIOS = 'https://api.esios.ree.es/indicators/1001';

/** REData's dates are the territory's local ones, `YYYY-MM-DDTHH:MM`. */
export function redataUrl(geo: Geo, from: string, to: string): string {
  return `${REDATA}?time_trunc=hour&geo_ids=${GEO_IDS[geo]}&start_date=${from}T00:00&end_date=${to}T23:59`;
}

export function esiosUrl(geo: Geo, from: string, to: string): string {
  return `${ESIOS}?start_date=${from}T00:00&end_date=${to}T23:59&geo_ids[]=${GEO_IDS[geo]}`;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const pvpc: PriceProvider = {
  id: 'pvpc',
  name: { en: 'Spain – PVPC (Red Eléctrica)', es: 'España – PVPC (Red Eléctrica)', de: 'Spanien – PVPC (Red Eléctrica)', 'zh-Hans': '西班牙 – PVPC（Red Eléctrica）', 'zh-Hant': '西班牙 – PVPC（Red Eléctrica）' },
  hosts: ['apidatos.ree.es', 'api.esios.ree.es'],
  area: (o) => geoOf(o.geo),
  zone: (o) => ZONES[geoOf(o.geo)],
  publish: { zone: 'Europe/Madrid', from: 20 * 60 + 15, by: 20 * 60 + 30 },
  credit: 'Red Eléctrica',
  shortCredit: 'REE',
  async download(o, today, ctx): Promise<Downloaded> {
    const geo = geoOf(o.geo);
    const tomorrow = addDays(today, 1);
    const req = ctx.signal ? { signal: ctx.signal } : {};
    try {
      const { data } = await ctx.http.json(redataUrl(geo, today, tomorrow), req);
      const parsed = parseRedata(data, geo);
      if (parsed.slots.length) return { ...parsed, origin: 'redata' };
      throw new Error('REData: no prices');
    } catch (err) {
      const token = o.esiosToken.trim();
      if (!token) throw err;
      ctx.log?.(`${message(err)}; trying ESIOS`);
      const { data } = await ctx.http.json(esiosUrl(geo, today, tomorrow), {
        ...req,
        headers: { Accept: 'application/json; application/vnd.esios-api-v1+json', 'x-api-key': token },
      });
      return { ...parseEsios(data, geo, GEO_IDS[geo]), origin: 'esios' };
    }
  },
};
