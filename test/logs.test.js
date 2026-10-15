// -----------------------------------------------------------------------------
// Quiet logs (maintainer notes, 13/10/2026): nothing at info for a normal
// cycle, one line at the first failure and one at the recovery, never an
// address with credentials. The integration has no secret to leak (no
// account, no key): the test checks no URL with credentials or token ever
// reaches the logs, whatever the level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE_MS, REGULAR_MS } from '../src/schedule.js';
import { NOV_3_2022_SWITCH, captureLogs, createWorld } from './helpers/world.js';

test('a normal cycle writes nothing at info', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  await world.createDevice();
  const logs = await captureLogs(async () => {
    for (let i = 0; i < 30; i += 1) {
      await world.advance(MINUTE_MS);
    }
    await world.advance(REGULAR_MS);
    await world.gladys.fake.poll(world.gladys.fake.discoveredDevices[0]);
    await world.gladys.fake.widgetGet('free_games', { settings: {}, language: 'fr' });
  }, 'info');
  assert.deepEqual(logs.lines, []);
});

test('the start says once that the store answers; a new game is one line', async () => {
  const logs = await captureLogs(async () => {
    const world = await createWorld();
    world.clock.now = NOV_3_2022_SWITCH + 2 * MINUTE_MS;
    await world.service.tick();
    world.stop();
  }, 'info');
  assert.deepEqual(
    logs.info.map((line) => line.replace(/^.*\] /, '')),
    [
      'Epic Games Store read (FR): 2 free, 2 coming',
      'New free game announced: Filament',
      'New free game announced: Rising Storm 2: Vietnam',
    ],
  );
});

test('a store down for an hour: one warning, then one line when it is back', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  const logs = await captureLogs(async () => {
    world.network.error = new TypeError('fetch failed', { cause: { code: 'ETIMEDOUT' } });
    await world.advance(REGULAR_MS);
    for (let i = 0; i < 120; i += 1) {
      await world.advance(MINUTE_MS);
    }
    world.network.error = null;
    await world.advance(60 * MINUTE_MS);
  }, 'info');
  assert.equal(logs.warn.length, 1);
  assert.match(
    logs.warn[0],
    /Epic Games Store not read: Epic Games Store unreachable \(ETIMEDOUT\)/,
  );
  assert.equal(logs.info.length, 1);
  assert.match(logs.info[0], /answers again/);
  assert.equal(logs.error.length, 0);
});

test('no credentials or token in the logs, even at debug', async () => {
  const logs = await captureLogs(async () => {
    const world = await createWorld();
    await world.createDevice();
    await world.advance(REGULAR_MS);
    world.network.error = new TypeError('fetch failed');
    await world.advance(REGULAR_MS);
    world.stop();
  }, 'debug');
  assert.ok(logs.lines.length > 0);
  for (const line of logs.lines) {
    assert.doesNotMatch(line, /https?:\/\/[^\s/]*@/, line);
    assert.doesNotMatch(line, /token|password|secret|authorization/i, line);
  }
});
