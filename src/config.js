// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object, so the rest of the code never deals
// with `undefined`, a lowercase country or an unknown language.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, and of every text this integration writes. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The Epic Games Store locale of each language: the titles, descriptions and
// store links come back in it. The store knows `en-US` and `es-ES`, not `en`
// or `es` alone (the list of the Home Assistant integration).
export const STORE_LOCALES = { en: 'en-US', fr: 'fr', de: 'de', es: 'es-ES' };

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Feature names, device texts and scene variables are written in this
  // language: a device integration never receives the user's language.
  language: 'fr',
  // ISO 3166-1 alpha-2: the store's region, which decides the offers
  // (a game can be free in one country and not in another).
  country: 'FR',
};

const COUNTRY_REGEX = /^[A-Z]{2}$/;

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 * @returns {{ language: string, country: string, countryValid: boolean }}
 */
export function normalizeConfig(raw = {}) {
  const language = LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language;
  const typed = String(raw.country ?? '')
    .trim()
    .toUpperCase();
  const country = typed === '' ? DEFAULT_CONFIG.country : typed;
  return {
    language,
    country,
    // A country that is not two letters is never sent to the store: the
    // integration says so instead (see src/service.js).
    countryValid: COUNTRY_REGEX.test(country),
  };
}

/** The store locale of a language (`fr` → `fr`, `en` → `en-US`). */
export function storeLocale(language) {
  return STORE_LOCALES[language] ?? STORE_LOCALES[DEFAULT_CONFIG.language];
}
