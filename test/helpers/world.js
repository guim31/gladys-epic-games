// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake network serving the
// real store answers of test/fixtures/epic (from the Home Assistant tests),
// a clock the test moves, a store in memory, and the integration wired on top
// through registerHandlers — the wiring index.js uses.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/epic/${name}.json`, import.meta.url), 'utf8'));

// A 1×1 PNG: what the CDN answers for a poster.
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** free_games.json: Saturnalia and Warhammer free until 3 Nov 2022, 15:00 UTC; then Filament and Rising Storm 2. */
export const OCT_30_2022 = Date.parse('2022-10-30T09:00:00Z');
export const NOV_3_2022_SWITCH = Date.parse('2022-11-03T15:00:00Z');

/**
 * A fake network: the store endpoint answers `network.payload` (or throws
 * `network.error`), the CDN answers a tiny PNG. Every request is recorded.
 */
export function createNetwork(payload = fixture('free_games')) {
  const network = {
    payload,
    error: null,
    status: 200,
    requests: [],
    image: Buffer.from(PNG_BASE64, 'base64'),
    async fetch(url) {
      const target = new URL(url);
      network.requests.push(target);
      if (target.hostname === 'store-site-backend-static.ak.epicgames.com') {
        if (network.error) {
          throw network.error;
        }
        return new Response(JSON.stringify(network.payload), {
          status: network.status,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (target.hostname.endsWith('epicgames.com')) {
        return new Response(network.image, { headers: { 'content-type': 'image/png' } });
      }
      throw new TypeError(`fetch failed: ${target.hostname} is not part of the test world`);
    },
    storeReads: () => network.requests.filter((url) => url.pathname === '/freeGamesPromotions'),
  };
  return network;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createNetwork
 * @param {number} [options.at] start time (epoch ms)
 * @param {object} [options.store]
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] run the service's own ticker
 * @param {number} [options.tickMs]
 */
export async function createWorld({
  config = {},
  network = createNetwork(),
  at = OCT_30_2022,
  store = new MemoryStore(),
  connect = true,
  timers = false,
  tickMs,
} = {}) {
  const clock = { now: at };
  const gladys = createFakeGladys({ config });
  const app = registerHandlers(gladys, {
    store,
    fetch: network.fetch,
    now: () => clock.now,
    timers,
    tickMs,
    timeZone: 'Europe/Paris',
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  const world = {
    gladys,
    app,
    service: app.service,
    network,
    clock,
    store,
    /** Move the clock and run one cycle of the ticker. */
    async advance(ms) {
      clock.now += ms;
      await app.service.tick();
    },
    /** Add the discovered device in Gladys, as the user does. */
    async createDevice() {
      const [device] = gladys.fake.discoveredDevices;
      await gladys.fake.deviceCreated(device);
      return device;
    },
    lastState: (key) =>
      gladys.fake.lastState(app.service.gladys.externalIds('store', 'free-games').feature(key)),
    stop: () => app.stop(),
  };
  return world;
}

/** Every line the integration logs while `fn` runs, by level. */
export async function captureLogs(fn, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  const lines = [];
  const originalLog = console.log;
  const originalError = console.error;
  const record = (...args) => lines.push(args.map(String).join(' '));
  console.log = record;
  console.error = record;
  process.env.LOG_LEVEL = level;
  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.env.LOG_LEVEL = previous;
  }
  const at = (name) => lines.filter((line) => line.includes(`[${name.toUpperCase()}]`));
  return { lines, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}
