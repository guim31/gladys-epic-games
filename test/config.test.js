// -----------------------------------------------------------------------------
// Configuration normalization: defaults, country casing, unknown languages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, storeLocale } from '../src/config.js';

test('defaults: French, France', () => {
  assert.deepEqual(normalizeConfig(), { language: 'fr', country: 'FR', countryValid: true });
  assert.deepEqual(DEFAULT_CONFIG, { language: 'fr', country: 'FR' });
});

test('the country is trimmed and uppercased, an empty one is the default', () => {
  assert.equal(normalizeConfig({ country: ' be ' }).country, 'BE');
  assert.equal(normalizeConfig({ country: '' }).country, 'FR');
  assert.equal(normalizeConfig({ country: null }).country, 'FR');
});

test('a country that is not two letters is kept but flagged', () => {
  assert.deepEqual(normalizeConfig({ country: 'France' }), {
    language: 'fr',
    country: 'FRANCE',
    countryValid: false,
  });
  assert.equal(normalizeConfig({ country: 'F1' }).countryValid, false);
});

test('an unknown language falls back to French; the store locales', () => {
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
  assert.equal(storeLocale('en'), 'en-US');
  assert.equal(storeLocale('es'), 'es-ES');
  assert.equal(storeLocale('de'), 'de');
  assert.equal(storeLocale('xx'), 'fr');
});
