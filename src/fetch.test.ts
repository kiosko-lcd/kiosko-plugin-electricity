import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttp } from '@kiosko/sdk';
import { fileStore, mergeSlots, planFetch, readPrices, type Cached } from './fetch.ts';
import { fixture } from './fixtures.ts';
import { pvpc } from './providers/pvpc/index.ts';

const PUB = pvpc.publish;
import { parseRedata } from './providers/pvpc/parse.ts';
import { daySlots } from './prices.ts';

const MADRID = 'Europe/Madrid';
const at = (iso: string) => Date.parse(iso);
const both = () => parseRedata(fixture('redata-2026-11-24-25-peninsula.json'), 'peninsula').slots;
const todayOnly = () => daySlots(both(), '2026-11-24', MADRID);
const cached = (slots = todayOnly(), attemptAt = at('2026-11-24T08:00:00+01:00')): Cached => ({ version: 1, provider: 'pvpc', area: 'peninsula', origin: 'redata', updated: null, fetchedAt: attemptAt, attemptAt, slots });

test('plan: nothing on disk, or today missing: ask (again every 5 minutes)', () => {
  assert.equal(planFetch(undefined, at('2026-11-24T10:00:00+01:00'), MADRID, PUB).fetch, true);
  const yesterday = cached(both().map((s) => ({ ...s, start: s.start - 2 * 86_400_000 })), at('2026-11-24T00:02:00+01:00'));
  assert.equal(planFetch(yesterday, at('2026-11-24T00:05:00+01:00'), MADRID, PUB).fetch, false);
  assert.equal(planFetch(yesterday, at('2026-11-24T00:08:00+01:00'), MADRID, PUB).fetch, true);
});

test('plan: today in, before 20:15: nothing to ask', () => {
  const c = cached(todayOnly(), at('2026-11-24T00:01:00+01:00'));
  for (const t of ['10:00', '15:00', '20:14']) assert.equal(planFetch(c, at(`2026-11-24T${t}:00+01:00`), MADRID, PUB).fetch, false, t);
});

test('plan: tomorrow from 20:15, every 30 min, plus right after 20:30', () => {
  const c = cached(todayOnly(), at('2026-11-24T20:16:00+01:00'));
  assert.equal(planFetch(cached(todayOnly(), at('2026-11-24T10:00:00+01:00')), at('2026-11-24T20:16:00+01:00'), MADRID, PUB).fetch, true);
  assert.equal(planFetch(c, at('2026-11-24T20:25:00+01:00'), MADRID, PUB).fetch, false);
  assert.equal(planFetch(c, at('2026-11-24T20:31:00+01:00'), MADRID, PUB).why, 'tomorrow: right after it is usually out');
  const after = cached(todayOnly(), at('2026-11-24T20:31:00+01:00'));
  assert.equal(planFetch(after, at('2026-11-24T20:50:00+01:00'), MADRID, PUB).fetch, false);
  assert.equal(planFetch(after, at('2026-11-24T21:01:00+01:00'), MADRID, PUB).fetch, true);
  assert.equal(planFetch(cached(both(), at('2026-11-24T20:31:00+01:00')), at('2026-11-24T23:00:00+01:00'), MADRID, PUB).fetch, false);
});

test('plan: 20:30 on the days the clock changes, and in the Canary Islands by Península time', () => {
  // 25 Oct 2026 (25 hours): 20:30 CET is 19:30Z.
  const oct = parseRedata(fixture('redata-2026-10-25-dst-end.json'), 'peninsula').slots;
  const c = cached(oct, at('2026-10-25T19:20:00Z'));
  assert.equal(planFetch(c, at('2026-10-25T19:25:00Z'), MADRID, PUB).fetch, false);
  assert.equal(planFetch(c, at('2026-10-25T19:31:00Z'), MADRID, PUB).why, 'tomorrow: right after it is usually out');
  const can = parseRedata(fixture('redata-2026-11-24-canarias.json'), 'canarias').slots;
  const cc = { ...cached(can, at('2026-11-24T19:20:00Z')), area: 'canarias' };
  // 19:31 in Canary time is 20:31 in Madrid: tomorrow is out.
  assert.equal(planFetch(cc, at('2026-11-24T19:31:00Z'), 'Atlantic/Canary', PUB).why, 'tomorrow: right after it is usually out');
});

/** A fake network: answers from fixtures by host, counts calls. */
function fakeNet(answers: Record<string, () => Response>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const host = new URL(url).host;
    const a = answers[host];
    if (!a) throw new Error('offline');
    return a();
  }) as unknown as typeof globalThis.fetch;
  return { calls, http: () => createHttp({ fetch }) };
}
const json = (doc: unknown, status = 200) => () => new Response(JSON.stringify(doc), { status, headers: { 'content-type': 'application/json' } });

test('read: fetches once, keeps it on disk, reads the disk after', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'electricity-'));
  try {
    const net = fakeNet({ 'apidatos.ree.es': json(fixture('redata-2026-11-24-25-peninsula.json')) });
    const o = { provider: 'pvpc', geo: 'peninsula', esiosToken: '' };
    const d = await readPrices(pvpc, o, { now: at('2026-11-24T21:10:00+01:00') }, { http: net.http(), store: fileStore(dir) });
    assert.equal(net.calls.length, 1);
    assert.match(net.calls[0]!.url, /geo_ids=8741&start_date=2026-11-24T00:00&end_date=2026-11-25T23:59/);
    assert.equal(d.slots.length, 48);
    assert.equal(d.origin, 'redata');
    assert.equal(d.stale, false);
    assert.ok(existsSync(join(dir, 'prices-pvpc-peninsula.json')));
    // Later, and after a restart (a new store): no network.
    const d2 = await readPrices(pvpc, o, { now: at('2026-11-24T23:00:00+01:00') }, { http: net.http(), store: fileStore(dir) });
    assert.equal(net.calls.length, 1);
    assert.equal(d2.slots.length, 48);
    // The next day, tomorrow became today: still nothing to ask until 20:15; yesterday is kept.
    const d3 = await readPrices(pvpc, o, { now: at('2026-11-25T12:00:00+01:00') }, { http: net.http(), store: fileStore(dir) });
    assert.equal(net.calls.length, 1);
    assert.equal(d3.slots.length, 48);
    // Two days on: yesterday's yesterday is dropped, and today is asked for.
    await assert.rejects(readPrices(pvpc, o, { now: at('2026-11-27T12:00:00+01:00') }, { http: fakeNet({}).http(), store: fileStore(dir) }), /offline|no prices/);
    const kept = JSON.parse(readFileSync(join(dir, 'prices-pvpc-peninsula.json'), 'utf8')) as Cached;
    assert.equal(kept.slots.length, 48);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: REE down, the copy on disk is used', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'electricity-'));
  try {
    const store = fileStore(dir);
    await store.save(cached(todayOnly(), at('2026-11-24T08:00:00+01:00')));
    const logs: string[] = [];
    const down = fakeNet({ 'apidatos.ree.es': json(fixture('redata-unpublished.json'), 502) });
    const d = await readPrices(pvpc, { provider: 'pvpc', geo: 'peninsula', esiosToken: '' }, { now: at('2026-11-24T20:40:00+01:00'), log: (m) => logs.push(m) }, { http: down.http(), store: fileStore(dir) });
    assert.equal(down.calls.length, 1);
    assert.equal(d.slots.length, 24);
    assert.equal(d.stale, false, "today's prices are whole: not stale");
    assert.match(logs.join('\n'), /502/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read: ESIOS only with a token, with it in the x-api-key header', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'electricity-'));
  try {
    const answers = { 'apidatos.ree.es': json(fixture('redata-error.json'), 400), 'api.esios.ree.es': json(fixture('esios-1001-2026-11-24.json')) };
    const now = at('2026-11-24T10:00:00+01:00');
    const a = fakeNet(answers);
    await assert.rejects(readPrices(pvpc, { provider: 'pvpc', geo: 'peninsula', esiosToken: '' }, { now }, { http: a.http(), store: fileStore(dir) }), /HTTP 400/);
    assert.deepEqual(a.calls.map((c) => new URL(c.url).host), ['apidatos.ree.es']);
    const b = fakeNet(answers);
    const d = await readPrices(pvpc, { provider: 'pvpc', geo: 'canarias', esiosToken: ' tok ' }, { now }, { http: b.http(), store: fileStore(dir) });
    assert.deepEqual(b.calls.map((c) => new URL(c.url).host), ['apidatos.ree.es', 'api.esios.ree.es']);
    assert.equal(b.calls[1]!.headers['x-api-key'], 'tok');
    assert.match(b.calls[1]!.url, /geo_ids\[\]=8742/);
    assert.equal(d.origin, 'esios');
    assert.equal(d.zone, 'Atlantic/Canary');
    assert.equal(d.slots.length, 24);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the file is written only when the prices change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'electricity-'));
  try {
    const store = fileStore(dir);
    const c = cached();
    await store.save(c);
    rmSync(join(dir, 'prices-pvpc-peninsula.json'));
    await store.save({ ...c, attemptAt: c.attemptAt + 60_000 });
    assert.ok(!existsSync(join(dir, 'prices-pvpc-peninsula.json')), 'only the attempt changed: not rewritten');
    await store.save({ ...c, slots: both() });
    assert.ok(existsSync(join(dir, 'prices-pvpc-peninsula.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('merge: the newest price wins, old days go', () => {
  const old = both();
  const fresh = [{ ...old[30]!, price: 1 }];
  const m = mergeSlots(old, fresh, old[24]!.start);
  assert.equal(m.length, 24);
  assert.equal(m[6]!.price, 1);
});
