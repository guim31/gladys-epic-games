// -----------------------------------------------------------------------------
// The integration end to end, on the SDK's fake Gladys and the real store
// answers of the Home Assistant tests: discovery, states, the container's own
// refresh, the scene trigger, the configuration and the action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { MemoryStore } from '../src/store.js';
import { FEATURE } from '../src/device.js';
import { HEARTBEAT_MS, NEW_FREE_GAME_TRIGGER } from '../src/service.js';
import { MINUTE_MS, REGULAR_MS } from '../src/schedule.js';
import { WIDGET_KEY } from '../src/widgets.js';
import {
  NOV_3_2022_SWITCH,
  OCT_30_2022,
  createNetwork,
  createWorld,
  fixture,
} from './helpers/world.js';

const HOUR_MS = 60 * MINUTE_MS;

test('connects, publishes the device, reads the store once and says it is connected', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  const devices = world.gladys.fake.discoveredDevices;
  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, 'Epic Games Store');
  assert.equal(world.network.storeReads().length, 1);
  const [read] = world.network.storeReads();
  assert.equal(read.searchParams.get('locale'), 'fr');
  assert.equal(read.searchParams.get('country'), 'FR');
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  // Not added to Gladys yet: nothing to publish, Gladys would drop it.
  assert.equal(world.gladys.fake.states.length, 0);
});

test('adding the device publishes every state at once, in French by default', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  assert.equal(
    world.lastState(FEATURE.CURRENT_TITLES),
    'Saturnalia · Warhammer 40,000: Mechanicus - Standard Edition',
  );
  assert.equal(world.lastState(FEATURE.CURRENT_COUNT), 2);
  assert.equal(world.lastState(FEATURE.CURRENT_END), 'jeu. 3 nov., 16:00');
  assert.equal(world.lastState(FEATURE.UPCOMING_TITLES), 'Filament · Rising Storm 2: Vietnam');
  assert.equal(world.lastState(FEATURE.UPCOMING_START), 'jeu. 3 nov., 16:00');
  assert.equal(world.lastState(FEATURE.UPCOMING_COUNT), 2);
  assert.ok(world.gladys.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('a cycle with nothing new publishes nothing', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  const published = world.gladys.fake.states.length;
  await world.advance(MINUTE_MS);
  await world.advance(REGULAR_MS);
  assert.equal(world.gladys.fake.states.length, published);
});

test('an unchanged state is sent again every 6 hours (heartbeat)', async (t) => {
  // The SDK dates its heartbeat with Date.now(): moved with the world's clock.
  t.mock.timers.enable({ apis: ['Date'], now: OCT_30_2022 });
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  const published = world.gladys.fake.states.length;
  await world.advance(HEARTBEAT_MS / 2);
  t.mock.timers.tick(HEARTBEAT_MS / 2);
  assert.equal(world.gladys.fake.states.length, published);
  t.mock.timers.tick(HEARTBEAT_MS / 2 + MINUTE_MS);
  await world.advance(HEARTBEAT_MS / 2 + MINUTE_MS);
  assert.equal(world.gladys.fake.states.length, published + 6);
});

test('the store is read 4 times a day, plus right after a switch', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  // One minute ticks over 4 days and a half: the switch of 3 Nov is inside.
  for (let elapsed = 0; elapsed < 108 * HOUR_MS; elapsed += MINUTE_MS) {
    await world.advance(MINUTE_MS);
  }
  const reads = world.network.storeReads().length;
  // 1 at start, every 6 h over 108 h, +2 around the switch.
  assert.ok(reads >= 19 && reads <= 21, `${reads} reads`);
  const readTimes = world.service.lastSuccessAt;
  assert.ok(readTimes > NOV_3_2022_SWITCH);
});

test('the states follow the clock without the core ever polling (Gladys#3198)', async (t) => {
  const world = await createWorld({ timers: true, tickMs: 5 });
  t.after(world.stop);
  await world.createDevice();
  let polls = 0;
  t.mock.method(world.service, 'poll', async () => {
    polls += 1;
  });
  assert.equal(world.lastState(FEATURE.CURRENT_COUNT), 2);
  // The switch passes: the ticker alone sees it, from the answer it has.
  world.clock.now = NOV_3_2022_SWITCH + 1000;
  for (let i = 0; i < 100 && !/Filament/.test(world.lastState(FEATURE.CURRENT_TITLES)); i += 1) {
    await sleep(5);
  }
  assert.equal(world.lastState(FEATURE.CURRENT_TITLES), 'Filament · Rising Storm 2: Vietnam');
  assert.equal(world.lastState(FEATURE.UPCOMING_TITLES), 'Aucun');
  assert.equal(world.lastState(FEATURE.UPCOMING_START), '—');
  assert.equal(polls, 0);
});

test("the core's onPoll is a fallback: skipped while the ticker runs, a cycle when it is late", async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  const device = await world.createDevice();
  let ticks = 0;
  const tick = world.service.tick.bind(world.service);
  t.mock.method(world.service, 'tick', async (...args) => {
    ticks += 1;
    return tick(...args);
  });
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(ticks, 0);
  world.clock.now += 2 * MINUTE_MS;
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(ticks, 1);
});

test('a game that becomes free is announced once, with its title, end date and link', async (t) => {
  const store = new MemoryStore();
  const world = await createWorld({ store });
  t.after(world.stop);
  // Installed on a Sunday: the games free since Thursday are not "new".
  assert.equal(world.gladys.fake.sceneEvents.length, 0);
  world.clock.now = NOV_3_2022_SWITCH + 2 * MINUTE_MS;
  await world.service.tick();
  const events = world.gladys.fake.sceneEvents;
  assert.deepEqual(
    events.map((event) => event.key),
    [NEW_FREE_GAME_TRIGGER, NEW_FREE_GAME_TRIGGER],
  );
  assert.deepEqual(events[0].data, {
    title: 'Filament',
    ends_at: 'jeu. 10 nov., 17:00',
    ends_at_iso: '2022-11-10T16:00:00.000Z',
    url: 'https://store.epicgames.com/fr/p/filament-332a92',
    publisher: 'Kasedo Games Ltd',
    original_price: '€16.99',
  });
  assert.equal(events[1].data.title, 'Rising Storm 2: Vietnam');
  await world.advance(30 * MINUTE_MS);
  assert.equal(world.gladys.fake.sceneEvents.length, 2);

  // A restart (update, Gladys reboot) remembers what was announced.
  world.stop();
  const again = await createWorld({ store, at: world.clock.now + HOUR_MS });
  t.after(again.stop);
  assert.equal(again.gladys.fake.sceneEvents.length, 0);
});

test('a mystery game is announced once revealed, under its real title', async (t) => {
  const network = createNetwork(fixture('free_games_christmas_special'));
  const world = await createWorld({ network, at: Date.parse('2023-12-28T10:00:00Z') });
  t.after(world.stop);
  await world.createDevice();
  assert.equal(world.lastState(FEATURE.CURRENT_TITLES), 'Cursed to Golf');
  assert.equal(world.lastState(FEATURE.UPCOMING_TITLES), 'Jeu mystère');

  // 17:00 Paris: the teaser starts, still a mystery in the last answer.
  world.clock.now = Date.parse('2023-12-28T16:00:30Z');
  await world.service.tick();
  assert.equal(world.lastState(FEATURE.CURRENT_TITLES), 'Jeu mystère');
  assert.equal(world.gladys.fake.sceneEvents.length, 0);

  // The read 2 minutes after the switch: Epic revealed the game.
  const revealed = fixture('free_games_christmas_special');
  const elements = revealed.data.Catalog.searchStore.elements;
  const mystery = elements.find((game) => game.title === 'Mystery Game Day 10');
  Object.assign(mystery, {
    title: 'Ghost Song',
    productSlug: 'ghost-song',
    promotions: {
      promotionalOffers: mystery.promotions.upcomingPromotionalOffers,
      upcomingPromotionalOffers: [],
    },
  });
  world.network.payload = revealed;
  world.clock.now = Date.parse('2023-12-28T16:02:00Z');
  await world.service.tick();
  assert.equal(world.lastState(FEATURE.CURRENT_TITLES), 'Ghost Song');
  assert.deepEqual(
    world.gladys.fake.sceneEvents.map((event) => event.data.title),
    ['Ghost Song'],
  );
  assert.equal(
    world.gladys.fake.sceneEvents[0].data.url,
    'https://store.epicgames.com/fr/p/ghost-song',
  );
});

test('a store that does not answer is reported, retried, and its recovery said', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  world.network.error = new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  await world.advance(REGULAR_MS);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.equal(
    world.gladys.fake.connectionStatus.message.fr.startsWith("L'Epic Games Store"),
    true,
  );
  // The last answer still drives the states, by the clock.
  assert.equal(world.lastState(FEATURE.CURRENT_COUNT), 2);
  const reads = world.network.storeReads().length;
  await world.advance(4 * MINUTE_MS);
  assert.equal(world.network.storeReads().length, reads, 'no retry before 5 minutes');
  await world.advance(MINUTE_MS);
  assert.equal(world.network.storeReads().length, reads + 1);
  world.network.error = null;
  await world.advance(15 * MINUTE_MS);
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
});

test('a country that is not two letters is never sent to the store', async (t) => {
  const world = await createWorld({ config: { country: 'France' } });
  t.after(world.stop);
  assert.equal(world.network.storeReads().length, 0);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.en, /two-letter code/);
});

test('a country the store does not know is reported as such (error 5222)', async (t) => {
  const world = await createWorld({
    config: { country: 'XX' },
    network: createNetwork(fixture('error_5222_wrong_country')),
  });
  t.after(world.stop);
  assert.match(world.gladys.fake.connectionStatus.message.en, /does not know this country/);
  assert.equal(world.service.view(), null);
});

test('another language: the texts, the store locale and the links follow', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  await world.gladys.fake.configUpdated({ language: 'de', country: 'FR' });
  const read = world.network.storeReads().at(-1);
  assert.equal(read.searchParams.get('locale'), 'de');
  assert.equal(world.lastState(FEATURE.CURRENT_END), 'Do., 3. Nov., 16:00');
  await world.gladys.fake.configUpdated({ language: 'en', country: 'FR' });
  assert.equal(world.network.storeReads().at(-1).searchParams.get('locale'), 'en-US');
  assert.equal(world.lastState(FEATURE.UPCOMING_COUNT), 2);
  assert.equal(world.lastState(FEATURE.CURRENT_END), 'Thu 3 Nov, 16:00');
});

test('another country: read at once, and its current games are not announced as new', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  world.clock.now = NOV_3_2022_SWITCH + 2 * MINUTE_MS;
  await world.service.tick();
  const announced = world.gladys.fake.sceneEvents.length;
  await world.gladys.fake.configUpdated({ language: 'fr', country: 'BE' });
  assert.equal(world.network.storeReads().at(-1).searchParams.get('country'), 'BE');
  assert.equal(world.gladys.fake.sceneEvents.length, announced);
});

test('"Refresh now" reads the store and lists the games in the four languages', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  const reads = world.network.storeReads().length;
  const ack = await world.gladys.fake.action('refresh', {});
  assert.equal(ack.success, true);
  assert.equal(world.network.storeReads().length, reads + 1);
  assert.deepEqual(Object.keys(ack.data.message).sort(), ['de', 'en', 'es', 'fr']);
  assert.equal(
    ack.data.message.fr,
    "Gratuits: Saturnalia, Warhammer 40,000: Mechanicus - Standard Edition (Gratuit jusqu'au jeu. 3 nov., 16:00). À venir: Filament, Rising Storm 2: Vietnam.",
  );
  world.network.error = new TypeError('fetch failed');
  const failed = await world.gladys.fake.action('refresh', {});
  assert.match(failed.data.message.en, /could not be read: The Epic Games Store does not answer/);
});

test('a reconnection publishes the device and every state again', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  const published = world.gladys.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.equal(world.gladys.fake.states.length, published + 6);
  assert.equal(world.network.storeReads().length, 1, 'no extra read on reconnection');
});

test('the widget answers before the first read, then with the lineup', async (t) => {
  const network = createNetwork();
  network.error = new TypeError('fetch failed');
  const world = await createWorld({ network, at: OCT_30_2022 });
  t.after(world.stop);
  const before = await world.gladys.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(before.success, true);
  assert.equal(before.data.content.components[0].text.en, undefined);
  assert.match(before.data.content.components[0].text, /does not answer/);
  network.error = null;
  await world.service.tick({ force: true });
  const after = await world.gladys.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'es' });
  const grid = after.data.content.components.find((component) => component.type === 'card-list');
  assert.equal(grid.items.length, 4);
  assert.equal(grid.items[0].badge.text, 'Gratis');
  const image = await world.gladys.fake.widgetGetImage(grid.items[0].image);
  assert.equal(image.success, true);
  assert.equal(typeof image.data.image, 'string');
});
