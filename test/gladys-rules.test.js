// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on the device discovered from the real
// store answers of test/fixtures/epic, in every feature-name language, and
// on the states it publishes for every one of those answers.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNetwork, createWorld, fixture } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const scenarios = [
  { label: 'free games, French names', fixture: 'free_games', at: '2022-10-30T09:00:00Z' },
  {
    label: 'one free game, English names',
    fixture: 'free_games_one',
    at: '2023-03-05T09:00:00Z',
    config: { language: 'en' },
  },
  {
    label: 'mystery game, German names',
    fixture: 'free_games_mystery_special',
    at: '2024-05-25T09:00:00Z',
    config: { language: 'de' },
  },
  {
    label: 'Christmas giveaway, Spanish names',
    fixture: 'free_games_christmas_special',
    at: '2023-12-28T10:00:00Z',
    config: { language: 'es' },
  },
  {
    label: 'partial error answer, US store',
    fixture: 'error_1004_attribute_not_found',
    at: '2023-10-07T09:00:00Z',
    config: { language: 'en', country: 'US' },
  },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async (t) => {
    const world = await createWorld({
      config: scenario.config,
      network: createNetwork(fixture(scenario.fixture)),
      at: Date.parse(scenario.at),
    });
    t.after(world.stop);
    const devices = world.gladys.fake.discoveredDevices;
    assert.equal(devices.length, 1);

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }

      // Every state goes to a feature of the device: a text one as a
      // non-empty `text`, a number within the display bounds otherwise.
      await world.createDevice();
      const byId = new Map(device.features.map((feature) => [feature.external_id, feature]));
      const states = world.gladys.fake.states;
      assert.equal(states.length, device.features.length, `${where}: one state per feature`);
      for (const state of states) {
        const feature = byId.get(state.device_feature_external_id);
        assert.ok(feature, `${where}: state for an unknown feature`);
        if (feature.category === 'text') {
          assert.equal(typeof state.text, 'string');
          assert.ok(state.text.trim().length > 0, `${feature.name}: empty text`);
          assert.ok(state.text.length <= 250, `${feature.name}: text too long`);
        } else {
          assert.ok(Number.isInteger(state.state), `${feature.name}: not an integer`);
          assert.ok(state.state >= feature.min && state.state <= feature.max, feature.name);
        }
      }
    }
  });
}

test('the external ids do not depend on the language or the country', async (t) => {
  const first = await createWorld();
  t.after(first.stop);
  const second = await createWorld({ config: { language: 'es', country: 'MX' } });
  t.after(second.stop);
  const ids = (world) =>
    world.gladys.fake.discoveredDevices.flatMap((device) => [
      device.external_id,
      ...device.features.map((feature) => feature.external_id),
    ]);
  assert.deepEqual(ids(first), ids(second));
  assert.deepEqual(ids(first), [
    'ext:test-integration:store:free-games',
    'ext:test-integration:store:free-games:current_titles',
    'ext:test-integration:store:free-games:current_end',
    'ext:test-integration:store:free-games:current_count',
    'ext:test-integration:store:free-games:upcoming_titles',
    'ext:test-integration:store:free-games:upcoming_start',
    'ext:test-integration:store:free-games:upcoming_count',
  ]);
});
