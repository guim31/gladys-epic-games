// -----------------------------------------------------------------------------
// The store client on the real answers of the Home Assistant tests
// (test/fixtures/epic, Apache 2.0): free games, discounts, mystery games,
// partial errors, unknown country.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EpicApiError,
  boundaries,
  classify,
  fetchPromotions,
  freeGamesPageUrl,
  parseGames,
  promotionsUrl,
} from '../src/epic.js';
import { normalizeConfig } from '../src/config.js';
import { fixture } from './helpers/world.js';

const at = (iso) => Date.parse(iso);
const titles = (games) => games.map((game) => game.title);

function view(name, iso, language = 'fr') {
  return classify(parseGames(fixture(name), language), at(iso));
}

test('the URL asks the locale of the language and the configured country', () => {
  const url = new URL(promotionsUrl(normalizeConfig({ language: 'es', country: 'mx' })));
  assert.equal(url.origin, 'https://store-site-backend-static.ak.epicgames.com');
  assert.equal(url.pathname, '/freeGamesPromotions');
  assert.equal(url.searchParams.get('locale'), 'es-ES');
  assert.equal(url.searchParams.get('country'), 'MX');
  assert.equal(url.searchParams.get('allowCountries'), 'MX');
  assert.equal(freeGamesPageUrl('en'), 'https://store.epicgames.com/en-US/free-games');
});

test('free games: two now, two coming; the discounts are left out', () => {
  const { current, upcoming } = view('free_games', '2022-10-30T00:00:00Z');
  assert.deepEqual(titles(current), [
    'Saturnalia',
    'Warhammer 40,000: Mechanicus - Standard Edition',
  ]);
  assert.deepEqual(titles(upcoming), ['Filament', 'Rising Storm 2: Vietnam']);
  // The links of the Home Assistant tests.
  assert.equal(current[1].url, 'https://store.epicgames.com/fr/p/warhammer-mechanicus-0e4b71');
  assert.equal(upcoming[1].url, 'https://store.epicgames.com/fr/p/rising-storm-2-vietnam');
  assert.equal(current[1].end, at('2022-11-03T15:00:00.000Z'));
  assert.equal(upcoming[0].start, at('2022-11-03T15:00:00.000Z'));
  assert.ok(current.every((game) => game.image.startsWith('https://cdn1.epicgames.com/')));
});

test('a game is current by its dates, even when the answer still lists it as upcoming', () => {
  const { current, upcoming } = view('free_games', '2022-11-03T15:00:01Z');
  assert.deepEqual(titles(current), ['Filament', 'Rising Storm 2: Vietnam']);
  assert.deepEqual(upcoming, []);
  // And an ended offer is gone.
  assert.deepEqual(view('free_games', '2022-11-11T00:00:00Z'), { current: [], upcoming: [] });
});

test('every 0 % offer counts, not only the first one (Call of the Sea: 60 %, 0 %, 60 %)', () => {
  const { current, upcoming } = view('free_games_one', '2023-03-05T00:00:00Z');
  assert.deepEqual(titles(current), ['Rise of Industry']);
  assert.deepEqual(titles(upcoming), ['Call of the Sea']);
  // Borderlands 3 Season Pass is only discounted.
  assert.ok(!titles([...current, ...upcoming]).includes('Borderlands 3 Season Pass'));
});

test('a mystery game is flagged, linked to the free games page, with its teaser picture', () => {
  const { current, upcoming } = view('free_games_mystery_special', '2024-05-25T00:00:00Z');
  assert.deepEqual(titles(current), ['Farming Simulator 22']);
  assert.equal(current[0].mystery, false);
  assert.equal(current[0].url, 'https://store.epicgames.com/fr/p/farming-simulator-22');
  assert.deepEqual(titles(upcoming), ['Mystery Game 3']);
  assert.equal(upcoming[0].mystery, true);
  assert.equal(upcoming[0].url, 'https://store.epicgames.com/fr/free-games');
  assert.match(upcoming[0].image, /vault/);
});

test('the Christmas giveaway: a game a day, duplicated offers counted once', () => {
  const { current, upcoming } = view('free_games_christmas_special', '2023-12-28T10:00:00Z');
  assert.deepEqual(titles(current), ['Cursed to Golf']);
  assert.equal(current[0].end, at('2023-12-28T16:00:00.000Z'));
  assert.deepEqual(titles(upcoming), ['Mystery Game Day 10']);
  assert.deepEqual(boundaries(parseGames(fixture('free_games_christmas_special'), 'fr')), [
    at('2023-12-27T16:00:00.000Z'),
    at('2023-12-28T16:00:00.000Z'),
    at('2023-12-29T16:00:00.000Z'),
  ]);
});

test('an answer with a partial error (1004) is still read; bundles link to /bundles', () => {
  const { current, upcoming } = view('error_1004_attribute_not_found', '2023-10-07T00:00:00Z');
  assert.deepEqual(titles(current), ['Godlike Burger']);
  assert.deepEqual(titles(upcoming), ['Blazing Sails', 'Q.U.B.E. ULTIMATE BUNDLE']);
  assert.equal(upcoming[1].url, 'https://store.epicgames.com/fr/bundles/qube-ultimate-bundle');
});

test('the links follow the language', () => {
  const { current } = view('free_games', '2022-10-30T00:00:00Z', 'en');
  assert.equal(current[0].url, 'https://store.epicgames.com/en-US/p/saturnalia');
});

const respond = (body, init) => async () => new Response(body, init);

test('fetchPromotions: a good answer, a partial error, an unknown country', async () => {
  const config = normalizeConfig({});
  const ok = await fetchPromotions(config, {
    fetch: respond(JSON.stringify(fixture('free_games'))),
  });
  assert.equal(ok.data.Catalog.searchStore.elements.length, 14);
  const partial = await fetchPromotions(config, {
    fetch: respond(JSON.stringify(fixture('error_1004_attribute_not_found'))),
  });
  assert.equal(partial.data.Catalog.searchStore.elements.length, 7);
  await assert.rejects(
    fetchPromotions(config, {
      fetch: respond(JSON.stringify(fixture('error_5222_wrong_country')), { status: 400 }),
    }),
    (err) => err instanceof EpicApiError && err.code === 5222 && /5222/.test(err.message),
  );
});

test('fetchPromotions: network errors, HTML pages and server errors are EpicApiErrors', async () => {
  const config = normalizeConfig({});
  await assert.rejects(
    fetchPromotions(config, {
      fetch: async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      },
    }),
    { name: 'EpicApiError', message: 'Epic Games Store unreachable (ECONNRESET)' },
  );
  await assert.rejects(
    fetchPromotions(config, { fetch: respond('<html>busy</html>', { status: 503 }) }),
    { name: 'EpicApiError', status: 503 },
  );
  await assert.rejects(fetchPromotions(config, { fetch: respond('{}', { status: 500 }) }), {
    name: 'EpicApiError',
    message: 'Epic Games Store answered HTTP 500',
  });
});

test('fetchPromotions: an answer too large is cut short', async () => {
  const huge = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
  });
  await assert.rejects(fetchPromotions(normalizeConfig({}), { fetch: respond(huge) }), {
    name: 'EpicApiError',
    message: /larger than/,
  });
});

test('fetchPromotions sends the user agent it is given', async () => {
  let headers;
  await fetchPromotions(normalizeConfig({}), {
    userAgent: 'gladys-epic-games/test',
    fetch: async (_url, init) => {
      headers = init.headers;
      return new Response(JSON.stringify(fixture('free_games')));
    },
  });
  assert.equal(headers['user-agent'], 'gladys-epic-games/test');
});

test('elements without promotions or with broken offers are ignored', () => {
  const games = parseGames(
    {
      data: {
        Catalog: {
          searchStore: {
            elements: [
              null,
              { title: 'No promotions', promotions: null },
              {
                title: 'Broken dates',
                promotions: {
                  promotionalOffers: [
                    {
                      promotionalOffers: [
                        {
                          startDate: 'soon',
                          endDate: 'later',
                          discountSetting: { discountPercentage: 0 },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    'fr',
  );
  assert.deepEqual(games, []);
});
