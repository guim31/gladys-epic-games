// -----------------------------------------------------------------------------
// The dashboard widget: every content it can build fits the core vocabulary
// and budget exactly (validateWidgetContent of the SDK finds nothing to drop),
// in the four languages and both displays, and its posters are served small
// enough, from Epic's hosts only.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { classify, parseGames } from '../src/epic.js';
import {
  IMAGE_SIZES,
  createImageRegistry,
  imageKey,
  isAllowedImageUrl,
  sizedUrl,
} from '../src/images.js';
import { WIDGET_KEY, buildWidgetContent } from '../src/widgets.js';
import { PNG_BASE64, createWorld, fixture } from './helpers/world.js';

const register = createImageRegistry({ fetch: async () => new Response('') }).register;

const lineup = (name, iso) => classify(parseGames(fixture(name), 'fr'), Date.parse(iso));

const SCENARIOS = {
  'free games': { view: lineup('free_games', '2022-10-30T00:00:00Z'), problem: null },
  'mystery game coming': {
    view: lineup('free_games_mystery_special', '2024-05-25T00:00:00Z'),
    problem: null,
  },
  'Christmas giveaway': {
    view: lineup('free_games_christmas_special', '2023-12-28T10:00:00Z'),
    problem: null,
  },
  'nothing announced': { view: { current: [], upcoming: [] }, problem: null },
  'before the first read': { view: null, problem: null },
  'store unreachable, last lineup kept': {
    view: lineup('free_games', '2022-10-30T00:00:00Z'),
    problem: 'unreachable',
  },
  'store unreachable, nothing known': { view: null, problem: 'unreachable' },
  'unknown country': { view: null, problem: 'unknownCountry' },
};

for (const [name, scenario] of Object.entries(SCENARIOS)) {
  for (const display of ['grid', 'list']) {
    test(`the widget content fits the core exactly (${name}, ${display})`, () => {
      for (const language of LANGUAGES) {
        const content = buildWidgetContent({
          ...scenario,
          language,
          display,
          timeZone: 'Europe/Paris',
          register,
        });
        assert.deepEqual(validateWidgetContent(content), [], `${language}`);
        assert.ok(content.components.length > 0);
      }
    });
  }
}

test('the grid lists the free games first, then the coming ones, each with its link', () => {
  const content = buildWidgetContent({
    ...SCENARIOS['free games'],
    language: 'fr',
    timeZone: 'Europe/Paris',
    register,
  });
  const grid = content.components.find((component) => component.type === 'card-list');
  assert.equal(grid.display, 'grid');
  assert.deepEqual(
    grid.items.map((item) => [item.title, item.badge.text, item.date]),
    [
      ['Saturnalia', 'Gratuit', '2022-11-03T15:00:00.000Z'],
      ['Warhammer 40,000: Mechanicus - Standard Edition', 'Gratuit', '2022-11-03T15:00:00.000Z'],
      ['Filament', 'Bientôt', '2022-11-03T15:00:00.000Z'],
      ['Rising Storm 2: Vietnam', 'Bientôt', '2022-11-03T15:00:00.000Z'],
    ],
  );
  assert.equal(grid.items[0].subtitle, "Gratuit jusqu'au jeu. 3 nov., 16:00");
  assert.equal(grid.items[0].links[0].url, 'https://store.epicgames.com/fr/p/saturnalia');
  assert.match(grid.items[0].description, /^Gratuit jusqu'au jeu\. 3 nov\., 16:00\n\n/);
  const caption = content.components.find((component) => component.type === 'text');
  assert.equal(caption.text, '2 gratuit(s) · 2 à venir');
  const button = content.components.find((component) => component.type === 'button');
  assert.equal(button.link.url, 'https://store.epicgames.com/fr/free-games');
});

test('a mystery game is named in the language of the user, without the teaser text', () => {
  const content = buildWidgetContent({
    ...SCENARIOS['mystery game coming'],
    language: 'de',
    register,
  });
  const grid = content.components.find((component) => component.type === 'card-list');
  const mystery = grid.items.at(-1);
  assert.equal(mystery.title, 'Mystery-Spiel');
  assert.equal(mystery.badge.text, 'Bald');
  assert.equal(mystery.links[0].url, 'https://store.epicgames.com/fr/free-games');
});

test('only Epic hosts over https are fetched for the posters', () => {
  assert.equal(isAllowedImageUrl('https://cdn1.epicgames.com/offer/x/poster.jpg'), true);
  assert.equal(isAllowedImageUrl('http://cdn1.epicgames.com/offer/x/poster.jpg'), false);
  assert.equal(isAllowedImageUrl('https://epicgames.com.evil.example/x.jpg'), false);
  assert.equal(isAllowedImageUrl('https://user:pass@cdn1.epicgames.com/x.jpg'), false);
  assert.equal(isAllowedImageUrl('https://192.0.2.10/x.jpg'), false);
  assert.equal(isAllowedImageUrl('not a url'), false);
  assert.equal(register('https://192.0.2.10/x.jpg'), null);
});

test('a poster key is stable for a URL and fits the core pattern', () => {
  const key = imageKey('https://cdn1.epicgames.com/offer/x/poster.jpg');
  assert.match(key, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.equal(key, imageKey('https://cdn1.epicgames.com/offer/x/poster.jpg'));
  assert.notEqual(key, imageKey('https://cdn1.epicgames.com/offer/y/poster.jpg'));
  assert.equal(
    sizedUrl('https://cdn1.epicgames.com/offer/x/poster.jpg', IMAGE_SIZES[0]),
    'https://cdn1.epicgames.com/offer/x/poster.jpg?h=480&quality=medium&resize=1&w=360',
  );
});

test('a poster too large at the first size is asked smaller, then cached', async () => {
  const asked = [];
  const tooLarge = Buffer.alloc(400 * 1024, 1);
  const registry = createImageRegistry({
    fetch: async (url) => {
      asked.push(new URL(url).searchParams.get('w'));
      const bytes = asked.length === 1 ? tooLarge : Buffer.from(PNG_BASE64, 'base64');
      return new Response(bytes);
    },
  });
  const key = registry.register('https://cdn1.epicgames.com/offer/x/poster.jpg');
  const image = await registry.resolve(key);
  assert.deepEqual(validateWidgetImage(image), []);
  assert.deepEqual(asked, ['360', '240']);
  await registry.resolve(key);
  assert.equal(asked.length, 2, 'served from the cache');
});

test('an unknown key, a bad key and an unusable poster are refused', async () => {
  const registry = createImageRegistry({ fetch: async () => new Response('<html></html>') });
  await assert.rejects(registry.resolve('poster-0000000000000000'), /Unknown image/);
  await assert.rejects(registry.resolve('../etc/passwd'), /Invalid image key/);
  const key = registry.register('https://cdn1.epicgames.com/offer/x/poster.jpg');
  await assert.rejects(registry.resolve(key), /unusable/);
});

test('the widget is served through the SDK with its posters', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  for (const display of ['grid', 'list']) {
    const ack = await world.gladys.fake.widgetGet(WIDGET_KEY, {
      settings: { display },
      language: 'en',
      units: 'metric',
    });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    const list = ack.data.content.components.find((component) => component.type === 'card-list');
    assert.equal(list.display, display);
    for (const item of list.items) {
      const image = await world.gladys.fake.widgetGetImage(item.image);
      assert.equal(image.success, true, item.title);
    }
  }
  const refused = await world.gladys.fake.widgetGetImage('poster-0000000000000000');
  assert.equal(refused.success, false);
});

test('a user language the integration does not write gets the widget in English', async (t) => {
  const world = await createWorld();
  t.after(world.stop);
  const ack = await world.gladys.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'it' });
  const caption = ack.data.content.components.find((component) => component.type === 'text');
  assert.equal(caption.text, '2 free now · 2 coming');
});
