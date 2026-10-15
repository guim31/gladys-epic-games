#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of the real Epic Games Store, through the integration's own
// client: what the integration would show right now, and whether the posters
// come back small enough for the Gladys widget (300 KB, 4096 px).
//
//   node scripts/probe.mjs [country] [language]     e.g. node scripts/probe.mjs FR fr
//
// No account, no key, nothing written anywhere: two GET requests to the
// promotions endpoint at most, and two to the CDN per poster tried. Exit code
// 1 when the store cannot be read or no poster fits.
// -----------------------------------------------------------------------------

import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { displayTitle } from '../src/device.js';
import { classify, fetchPromotions, parseGames, promotionsUrl } from '../src/epic.js';
import { formatDate } from '../src/i18n.js';
import { IMAGE_SIZES, isAllowedImageUrl, sizedUrl } from '../src/images.js';
import { USER_AGENT } from '../src/app.js';

const [countryArg = 'FR', languageArg = 'fr'] = process.argv.slice(2);
const config = normalizeConfig({ country: countryArg, language: languageArg });
if (!config.countryValid) {
  console.error(`"${countryArg}" is not a two-letter country code`);
  process.exit(1);
}

console.log(`GET ${promotionsUrl(config)}`);
let payload;
try {
  payload = await fetchPromotions(config, { userAgent: USER_AGENT });
} catch (err) {
  console.error(`FAILED: ${err.message}${err.code ? ` (code ${err.code})` : ''}`);
  process.exit(1);
}

const elements = payload.data.Catalog.searchStore.elements;
const games = parseGames(payload, config.language);
const now = Date.now();
const { current, upcoming } = classify(games, now);
console.log(
  `${elements.length} elements, ${games.length} with a free offer` +
    (payload.errors ? `, ${payload.errors.length} partial error(s) ignored` : ''),
);

const show = (label, list, key) => {
  console.log(`\n${label}: ${list.length}`);
  for (const game of list) {
    console.log(
      `  - ${displayTitle(game, config.language)}${game.mystery ? ' [mystery]' : ''}` +
        ` | ${key === 'end' ? 'until' : 'from'} ${formatDate(game[key], config.language)}` +
        ` | ${game.url}`,
    );
  }
};
show('Free now', current, 'end');
show('Coming', upcoming, 'start');

// Posters: the first sizes the integration asks, checked like the core does.
console.log('\nPosters');
let fitting = 0;
const posters = [...current, ...upcoming].filter((game) => game.image).slice(0, 4);
for (const game of posters) {
  if (!isAllowedImageUrl(game.image)) {
    console.log(
      `  - ${game.title}: not an Epic https URL, skipped (${new URL(game.image).hostname})`,
    );
    continue;
  }
  for (const size of IMAGE_SIZES) {
    const response = await fetch(sizedUrl(game.image, size), {
      signal: AbortSignal.timeout(15_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const problems = response.ok
      ? validateWidgetImage(bytes.toString('base64'))
      : [`HTTP ${response.status}`];
    console.log(
      `  - ${game.title} at ${size.w}×${size.h}: ${response.headers.get('content-type')}, ` +
        `${Math.round(bytes.length / 1024)} KB → ${problems.length === 0 ? 'OK' : problems.join('; ')}`,
    );
    if (problems.length === 0) {
      fitting += 1;
      break;
    }
  }
}

if (posters.length > 0 && fitting === 0) {
  console.error('\nFAILED: no poster fits the widget bounds');
  process.exit(1);
}
console.log('\nOK');
