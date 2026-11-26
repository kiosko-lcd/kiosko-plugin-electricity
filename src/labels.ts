/** Every word the widgets paint, in the plugin's five languages. */
import type { Localized } from '@kiosko/sdk';
import { L } from './i18n.ts';
import type { Geo } from './providers/pvpc/geo.ts';
import type { Level } from './types.ts';

export const LEVEL_LABELS: Record<Level, Localized> = {
  cheap: L('Cheap', 'Barata', 'Günstig', '便宜', '便宜'),
  normal: L('Normal', 'Normal', 'Normal', '一般', '一般'),
  expensive: L('Expensive', 'Cara', 'Teuer', '贵', '貴'),
};

export const GEO_LABELS: Record<Geo, Localized> = {
  peninsula: L('Península (mainland Spain)', 'Península', 'Festland (Península)', '西班牙本土', '西班牙本土'),
  canarias: L('Canary Islands', 'Canarias', 'Kanaren', '加那利群岛', '加那利群島'),
  baleares: L('Balearic Islands', 'Baleares', 'Balearen', '巴利阿里群岛', '巴利阿里群島'),
  ceuta: L('Ceuta', 'Ceuta', 'Ceuta', '休达', '休達'),
  melilla: L('Melilla', 'Melilla', 'Melilla', '梅利利亚', '梅利利亞'),
};

export const NOW = L('Now', 'Ahora', 'Jetzt', '现在', '現在');
export const TODAY = L('Today', 'Hoy', 'Heute', '今天', '今天');
export const TOMORROW = L('Tomorrow', 'Mañana', 'Morgen', '明天', '明天');
/** Lower case, before a time: "tomorrow 02:00–05:00". */
export const TOMORROW_TAG = L('tomorrow', 'mañana', 'morgen', '明天', '明天');
export const NOW_TAG = L('now', 'ahora', 'jetzt', '现在', '現在');

export const WAITING = L('Reading prices…', 'Leyendo precios…', 'Preise werden gelesen…', '正在读取电价…', '正在讀取電價…');
export const NO_TODAY = L('No prices for today yet', 'Aún no hay precios de hoy', 'Noch keine Preise für heute', '暂无今天的电价', '尚無今天的電價');
export const NO_WINDOW = L('No prices left for today', 'No quedan precios de hoy', 'Für heute keine Preise mehr', '今天已无后续电价', '今天已無後續電價');
export const TOMORROW_AT = L(
  "Tomorrow's come at about 20:15",
  'Los de mañana llegan hacia las 20:15',
  'Die für morgen kommen gegen 20:15',
  '明天的电价约 20:15 公布',
  '明天的電價約 20:15 公布',
);

/** `{when}`: "02:00–05:00" or "tomorrow 02:00–05:00". */
export const NEXT_CHEAP = L('Next cheap: {when}', 'Próxima barata: {when}', 'Günstig: {when}', '下个便宜时段：{when}', '下個便宜時段：{when}');
export const CHEAP_UNTIL = L('Cheap until {t}', 'Barata hasta las {t}', 'Günstig bis {t}', '{t} 前都便宜', '{t} 前都便宜');
export const MIN_MAX = L('min {lo} · max {hi}', 'mín {lo} · máx {hi}', 'min {lo} · max {hi}', '最低 {lo} · 最高 {hi}', '最低 {lo} · 最高 {hi}');
/** `{d}`: "2 h", "1 h 30". */
export const BEST_HOURS = L('Cheapest {d}', 'Las {d} más baratas', 'Günstigste {d}', '最便宜的 {d}', '最便宜的 {d}');
/** `{d}`: "2 h 10". */
export const IN = L('in {d}', 'en {d}', 'in {d}', '{d}后', '{d}後');
/** The publisher's terms (REE's) ask for their name and the date of the data's last update. */
export const SOURCE_LINE = L('{who} · {at}', '{who} · {at}', '{who} · {at}', '{who} · {at}', '{who} · {at}');
export const OLD = L('not updated', 'sin actualizar', 'nicht aktuell', '未更新', '未更新');

export const fill = (text: string, values: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
