/**
 * Electricity prices by the hour: the price now against the rest of the
 * day, the day's bars with tomorrow's once published, and the cheapest
 * hours to run the washing machine. One provider today, Spain's PVPC from
 * Red Eléctrica (no key); others plug in as modules under `providers/`.
 */
import { definePlugin } from '@kiosko/sdk';
import { L, LANGUAGES } from './i18n.ts';
import { PROVIDER_IDS, PROVIDERS } from './providers/index.ts';
import { pricesSource, VERSION } from './source.ts';
import { chart } from './widget-chart.ts';
import { now } from './widget-now.ts';
import { windows } from './widget-windows.ts';

export { PROVIDERS } from './providers/index.ts';
export { pricesSource } from './source.ts';
export { chart } from './widget-chart.ts';
export { now } from './widget-now.ts';
export { windows } from './widget-windows.ts';

export default definePlugin({
  id: 'electricity',
  name: L('Electricity price by the hour', 'Precio de la luz por horas', 'Strompreis nach Stunden', '逐小时电价', '逐小時電價'),
  version: VERSION,
  description: L(
    "The electricity price by the hour on the panel: the price now, green, grey or amber against the rest of the day, the day's bars with tomorrow's once published, and the cheapest hours to run the washing machine. Today for Spain's regulated tariff (PVPC), from Red Eléctrica, no key needed.",
    'El precio de la luz por horas en el panel: el de ahora, en verde, gris o ámbar frente al resto del día, las barras del día con las de mañana en cuanto se publican, y las horas más baratas para poner la lavadora. Hoy para la tarifa regulada de España (PVPC), de Red Eléctrica, sin clave.',
    'Der Strompreis nach Stunden auf dem Panel: der Preis jetzt, grün, grau oder gelb im Vergleich zum Rest des Tages, die Balken des Tages mit denen von morgen, sobald veröffentlicht, und die günstigsten Stunden für die Waschmaschine. Derzeit für Spaniens regulierten Tarif (PVPC), von Red Eléctrica, ohne Schlüssel.',
    '在副屏上查看逐小时电价：当前电价，与当天其他时段相比以绿色、灰色或琥珀色显示；当天的柱状图，明天的电价公布后一并显示；以及开洗衣机最便宜的时段。目前支持西班牙受监管电价（PVPC），数据来自 Red Eléctrica，无需密钥。',
    '在面板上查看逐小時電價：目前電價，與當天其他時段相比以綠色、灰色或琥珀色顯示；當天的長條圖，明天的電價公布後一併顯示；以及開洗衣機最便宜的時段。目前支援西班牙受管制電價（PVPC），資料來自 Red Eléctrica，無需金鑰。',
  ),
  author: 'Loksly',
  license: 'MIT',
  homepage: 'https://github.com/kiosko-lcd/kiosko-plugin-electricity#readme',
  repository: 'https://github.com/kiosko-lcd/kiosko-plugin-electricity',
  icon: 'plug-zap',
  sdk: '^0.2.0',
  platforms: ['linux', 'darwin', 'win32'],
  languages: LANGUAGES,
  permissions: { network: [...new Set(PROVIDER_IDS.flatMap((id) => PROVIDERS[id].hosts))] },
  resources: { memoryMb: 10, cpu: 'low' },
  widgets: [now, chart, windows],
  sources: [pricesSource],
});
