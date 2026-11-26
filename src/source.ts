/**
 * The `electricity/prices` source: today's and tomorrow's hourly prices from
 * a provider (today only Spain's PVPC, from REE), kept on disk, with the
 * optional alerts. A provider's own options (the PVPC's territory and ESIOS
 * token) sit next to the `provider` choice.
 */
import { createHttp, defineSource, t } from '@kiosko/sdk';
import { priceAlerts } from './alerts.ts';
import { demoData } from './demo.ts';
import { fileStore, readPrices, type Store } from './fetch.ts';
import { L } from './i18n.ts';
import { GEO_LABELS } from './labels.ts';
import { PROVIDER_IDS, PROVIDERS, providerOf } from './providers/index.ts';
import type { ProviderOptions } from './providers/provider.ts';
import { GEOS } from './providers/pvpc/geo.ts';
import type { PriceData } from './types.ts';

export const VERSION = '0.1.0';

export const sourceOptions = t.object({
  provider: t.enum(PROVIDER_IDS, {
    default: 'pvpc',
    label: L('Prices', 'Precios', 'Preise', '电价来源', '電價來源'),
    help: L(
      "Whose hourly prices. Today: Spain's regulated tariff (PVPC), from Red Eléctrica.",
      'De dónde salen los precios por horas. Hoy: la tarifa regulada de España (PVPC), de Red Eléctrica.',
      'Wessen Stundenpreise. Derzeit: Spaniens regulierter Tarif (PVPC), von Red Eléctrica.',
      '逐小时电价的来源。目前支持：西班牙受监管电价（PVPC），来自 Red Eléctrica。',
      '逐小時電價的來源。目前支援：西班牙受管制電價（PVPC），來自 Red Eléctrica。',
    ),
    labels: Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].name])),
  }),
  geo: t.enum(GEOS, {
    default: 'peninsula',
    label: L('Territory (PVPC)', 'Territorio (PVPC)', 'Gebiet (PVPC)', '地区（PVPC）', '地區（PVPC）'),
    help: L(
      'The PVPC is the same price for every territory today, but REE publishes one per territory. Times are shown on its clock (the Canary Islands, an hour behind).',
      'Hoy el PVPC es el mismo en todos los territorios, pero REE publica uno por territorio. Las horas se muestran en su reloj (Canarias, una hora menos).',
      'Der PVPC ist heute überall gleich, aber REE veröffentlicht ihn je Gebiet. Die Uhrzeiten gelten in dessen Zeitzone (die Kanaren eine Stunde zurück).',
      '目前各地区的 PVPC 价格相同，但 REE 按地区分别公布。时间按当地时钟显示（加那利群岛晚一小时）。',
      '目前各地區的 PVPC 價格相同，但 REE 按地區分別公布。時間按當地時鐘顯示（加那利群島晚一小時）。',
    ),
    labels: GEO_LABELS,
  }),
  alertCheapest: t.boolean({
    default: false,
    label: L('Alert when the cheapest hours start', 'Avisar cuando empiecen las horas más baratas', 'Warnen, wenn die günstigsten Stunden beginnen', '最便宜时段开始时提醒', '最便宜時段開始時提醒'),
    help: L(
      'A full-screen notice, once a day, when the cheapest run of the day (of the length below) starts.',
      'Un aviso a pantalla completa, una vez al día, cuando empiece el tramo más barato del día (de la duración de abajo).',
      'Ein Vollbild-Hinweis, einmal am Tag, wenn der günstigste Abschnitt des Tages (mit der Dauer unten) beginnt.',
      '每天一次全屏提醒：当天最便宜的连续时段（时长见下方）开始时。',
      '每天一次全螢幕提醒：當天最便宜的連續時段（時長見下方）開始時。',
    ),
  }),
  alertDurationMs: t.duration({
    default: 2 * 3_600_000,
    min: 3_600_000,
    max: 4 * 3_600_000,
    label: L('Length of the cheapest run', 'Duración del tramo más barato', 'Dauer des günstigsten Abschnitts', '最便宜时段的时长', '最便宜時段的時長'),
  }),
  alertAbove: t.number({
    default: 0,
    min: 0,
    max: 2,
    unit: '€/kWh',
    label: L('Alert over this price', 'Avisar por encima de este precio', 'Warnen über diesem Preis', '高于此价格时提醒', '高於此價格時提醒'),
    help: L(
      '€/kWh, e.g. 0.25: a full-screen notice when the price goes over it, once each time. 0: off.',
      '€/kWh, p. ej. 0,25: un aviso a pantalla completa cuando el precio lo supere, una vez cada vez. 0: desactivado.',
      '€/kWh, z. B. 0,25: ein Vollbild-Hinweis, wenn der Preis darüber steigt, einmal pro Mal. 0: aus.',
      '单位 €/kWh，例如 0.25：电价超过时全屏提醒，每次一次。0：关闭。',
      '單位 €/kWh，例如 0.25：電價超過時全螢幕提醒，每次一次。0：關閉。',
    ),
  }),
  esiosToken: t.string({
    label: L('ESIOS token (PVPC, optional)', 'Token de ESIOS (PVPC, opcional)', 'ESIOS-Token (PVPC, optional)', 'ESIOS 令牌（PVPC，可选）', 'ESIOS 權杖（PVPC，選填）'),
    help: L(
      "Only if REData fails often: REE's ESIOS is asked instead. Ask for a free token by email to consultasios@ree.es.",
      'Solo si REData falla a menudo: se pregunta a ESIOS de REE en su lugar. El token es gratuito, se pide por correo a consultasios@ree.es.',
      'Nur wenn REData oft ausfällt: Dann wird ESIOS von REE gefragt. Den kostenlosen Token per E-Mail an consultasios@ree.es anfordern.',
      '仅在 REData 经常失败时使用：改为查询 REE 的 ESIOS。免费令牌可发邮件至 consultasios@ree.es 申请。',
      '僅在 REData 經常失敗時使用：改為查詢 REE 的 ESIOS。免費權杖可寄信至 consultasios@ree.es 申請。',
    ),
    secret: true,
    advanced: true,
  }),
});

type Options = ProviderOptions & { alertCheapest: boolean; alertDurationMs: number; alertAbove: number };

const stores = new Map<string, Store>();
const http = createHttp({ agent: `kiosko-plugin-electricity/${VERSION}` });

export const pricesSource = defineSource({
  id: 'prices',
  name: L('Electricity prices', 'Precio de la luz', 'Strompreise', '电价', '電價'),
  description: L(
    "Today's and tomorrow's electricity prices, hour by hour. Today: Spain's regulated tariff (PVPC 2.0TD), from Red Eléctrica's public data (REData, no key), tomorrow's from about 20:15. Kept on disk: the provider is asked only for what is missing.",
    'El precio de la luz de hoy y de mañana, hora a hora. Hoy: la tarifa regulada de España (PVPC 2.0TD), de los datos públicos de Red Eléctrica (REData, sin clave), la de mañana desde las 20:15 más o menos. Se guarda en disco: solo se pide lo que falta.',
    'Die Strompreise von heute und morgen, Stunde für Stunde. Derzeit: Spaniens regulierter Tarif (PVPC 2.0TD) aus den offenen Daten von Red Eléctrica (REData, ohne Schlüssel), der von morgen ab etwa 20:15. Auf der Platte gespeichert: Es wird nur nach Fehlendem gefragt.',
    '今天和明天的逐小时电价。目前支持：西班牙受监管电价（PVPC 2.0TD），来自 Red Eléctrica 的公开数据（REData，无需密钥），明天的电价约 20:15 公布。保存在磁盘上，只请求缺少的部分。',
    '今天和明天的逐小時電價。目前支援：西班牙受管制電價（PVPC 2.0TD），來自 Red Eléctrica 的公開資料（REData，無需金鑰），明天的電價約 20:15 公布。儲存在磁碟上，只請求缺少的部分。',
  ),
  options: sourceOptions,
  // Mostly a read of the copy on disk; the network only as `planFetch` says.
  intervalMs: 5 * 60_000,
  minIntervalMs: 60_000,
  timeoutMs: 30_000,
  background: true,
  async read(ctx): Promise<PriceData> {
    let store = stores.get(ctx.dataDir);
    if (!store) stores.set(ctx.dataDir, (store = fileStore(ctx.dataDir)));
    const o = ctx.options as Options;
    return readPrices(providerOf(o.provider), o, { now: ctx.now, signal: ctx.signal, log: (m) => ctx.log(m) }, { http, store });
  },
  demo: ({ now }) => demoData(now),
  alerts: ({ data, options, now }) => priceAlerts(data, options as Options, now),
});
