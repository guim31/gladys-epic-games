// -----------------------------------------------------------------------------
// Epic Games Store client: the public "free games promotions" endpoint.
//
// No account, no key: the endpoint the store's own "Free games" page reads,
// served by a CDN. It answers the promotions of the moment and of the next
// weeks, in the requested locale and for the requested country.
//
// Parsing follows the Home Assistant `epic_games_store` integration (Apache
// 2.0), with three differences learned from its real fixtures:
//   - every 0 % offer of a game is read, not only the first one: Epic lists
//     several overlapping offers (Call of the Sea: 60 %, 0 %, 60 %);
//   - a game is current or upcoming by its dates, read against the clock,
//     not by the list it sits in: the CDN answer may lag the switch by a few
//     minutes, and a game whose start time has passed is free;
//   - "mystery games" (the Christmas and Mega Sale teasers) are flagged: their
//     title and image are a placeholder until Epic reveals them.
// -----------------------------------------------------------------------------

import { storeLocale } from './config.js';

export const API_URL = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions';
export const STORE_URL = 'https://store.epicgames.com';

// The store answers in about 100 KB; a bound keeps a broken proxy from
// filling the 256 MB of the sandbox.
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

// The namespace and the slug Epic gives the placeholders of its mystery
// games (free_games_mystery_special.json, free_games_christmas_special.json).
const MYSTERY_TITLE = /mystery\s+game/i;
const PLACEHOLDER_SLUGS = new Set(['', '[]']);

/** An error of the store, with Epic's numeric code when it gave one (5222: bad country). */
export class EpicApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'EpicApiError';
    this.status = status;
    this.code = code;
  }
}

/** The URL asked for one language and one country. */
export function promotionsUrl(config) {
  const url = new URL(API_URL);
  url.searchParams.set('locale', storeLocale(config.language));
  url.searchParams.set('country', config.country);
  url.searchParams.set('allowCountries', config.country);
  return url.toString();
}

/** The store's "Free games" page in the user's language. */
export function freeGamesPageUrl(language) {
  return `${STORE_URL}/${storeLocale(language)}/free-games`;
}

/**
 * Read the promotions from the store.
 * @param {{ language: string, country: string }} config normalized config
 * @param {{ fetch?: typeof fetch, userAgent?: string }} [options]
 * @returns {Promise<object>} the raw JSON answer
 * @throws {EpicApiError}
 */
export async function fetchPromotions(config, { fetch: doFetch = fetch, userAgent } = {}) {
  let response;
  try {
    response = await doFetch(promotionsUrl(config), {
      headers: {
        accept: 'application/json',
        ...(userAgent ? { 'user-agent': userAgent } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new EpicApiError(`Epic Games Store unreachable (${err.cause?.code ?? err.message})`);
  }
  const body = await readBody(response, MAX_RESPONSE_BYTES);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new EpicApiError(`Epic Games Store answered HTTP ${response.status}, not JSON`, {
      status: response.status,
    });
  }
  // A GraphQL answer: `errors` may come with usable data (1004, an unknown
  // offer mapping, is harmless), or without (5222, an unknown country).
  if (!Array.isArray(payload?.data?.Catalog?.searchStore?.elements)) {
    const { message, code } = describeErrors(payload?.errors);
    throw new EpicApiError(message ?? `Epic Games Store answered HTTP ${response.status}`, {
      status: response.status,
      code,
    });
  }
  if (!response.ok) {
    throw new EpicApiError(`Epic Games Store answered HTTP ${response.status}`, {
      status: response.status,
    });
  }
  return payload;
}

async function readBody(response, maxBytes) {
  if (!response.body?.getReader) {
    return response.text();
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new EpicApiError(`Epic Games Store answer larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The first meaningful error of a GraphQL `errors` array. */
function describeErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return {};
  }
  for (const error of errors) {
    try {
      const service = JSON.parse(error.serviceResponse);
      if (service?.numericErrorCode !== undefined) {
        return {
          code: service.numericErrorCode,
          message: `Epic Games Store error ${service.numericErrorCode}: ${service.errorMessage ?? service.errorCode}`,
        };
      }
    } catch {
      // serviceResponse is optional and free-form.
    }
  }
  return { message: `Epic Games Store error: ${errors[0]?.message ?? 'unknown'}` };
}

const clean = (text) =>
  String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();

/** Every offer of a promotions block at 0 % (free), as `{ start, end }` in ms. */
function freeOffers(groups) {
  const offers = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const offer of group?.promotionalOffers ?? []) {
      if (offer?.discountSetting?.discountPercentage !== 0) {
        continue;
      }
      const start = Date.parse(offer.startDate);
      const end = Date.parse(offer.endDate);
      if (Number.isFinite(start) && Number.isFinite(end) && start < end) {
        offers.push({ start, end });
      }
    }
  }
  return offers;
}

function pickImage(images, types) {
  for (const type of types) {
    const found = images.find((image) => image?.type === type && typeof image.url === 'string');
    if (found) {
      return found.url;
    }
  }
  return null;
}

/** The page slug of a game, as the store links it (the Home Assistant order). */
function pageSlug(raw) {
  const candidates = [
    raw.offerMappings?.[0]?.pageSlug,
    raw.catalogNs?.mappings?.[0]?.pageSlug,
    raw.productSlug,
    raw.urlSlug,
  ];
  for (const candidate of candidates) {
    const slug = clean(candidate);
    if (!PLACEHOLDER_SLUGS.has(slug)) {
      // productSlug sometimes carries a sub-page ("rising-storm-2-vietnam/home").
      return slug.replace(/\/home$/, '');
    }
  }
  return null;
}

/**
 * One game of the answer, reduced to what the integration shows. Null when
 * the element has no free offer (a discount, a vault placeholder).
 * @param {object} raw an element of `data.Catalog.searchStore.elements`
 * @param {string} language the configured language (links)
 */
export function parseGame(raw, language) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const offers = [
    ...freeOffers(raw.promotions?.promotionalOffers),
    ...freeOffers(raw.promotions?.upcomingPromotionalOffers),
  ];
  if (offers.length === 0) {
    return null;
  }
  const title = clean(raw.title);
  const slug = pageSlug(raw);
  const mystery = MYSTERY_TITLE.test(title) || slug === null;
  const images = Array.isArray(raw.keyImages) ? raw.keyImages : [];
  const kind = raw.offerType === 'BUNDLE' ? 'bundles' : 'p';
  return {
    id: clean(raw.id) || `${clean(raw.namespace)}:${title}`,
    title,
    mystery,
    url: mystery
      ? freeGamesPageUrl(language)
      : `${STORE_URL}/${storeLocale(language)}/${kind}/${slug}`,
    publisher: clean(raw.seller?.name) || null,
    originalPrice: clean(raw.price?.totalPrice?.fmtPrice?.originalPrice) || null,
    description: clean(raw.description) || null,
    // Tall (2:3) for the poster grid, wide (16:9) as the fallback: the
    // mystery placeholders only have their wide "vault" picture.
    image: pickImage(images, [
      'OfferImageTall',
      'DieselStoreFrontTall',
      'Thumbnail',
      'OfferImageWide',
      'DieselStoreFrontWide',
      'VaultClosed',
    ]),
    offers,
  };
}

/**
 * Every game with a free offer in the answer, one entry per game.
 * @param {object} payload the raw answer of fetchPromotions
 * @param {string} language
 */
export function parseGames(payload, language) {
  const elements = payload?.data?.Catalog?.searchStore?.elements ?? [];
  const games = new Map();
  for (const raw of elements) {
    const game = parseGame(raw, language);
    if (!game) {
      continue;
    }
    const known = games.get(game.id);
    if (known) {
      known.offers.push(...game.offers);
    } else {
      games.set(game.id, game);
    }
  }
  return [...games.values()];
}

/**
 * Split the games into those free right now and those free soon, at `now`.
 * A game free now and again later is current; overlapping or duplicated
 * offers count once.
 * @param {ReturnType<typeof parseGames>} games
 * @param {number} now epoch ms
 * @returns {{ current: Array, upcoming: Array }} each game with its `start` and `end`
 */
export function classify(games, now) {
  const current = [];
  const upcoming = [];
  for (const game of games) {
    const live = game.offers.filter((offer) => offer.start <= now && now < offer.end);
    if (live.length > 0) {
      const start = Math.min(...live.map((offer) => offer.start));
      const end = Math.max(...live.map((offer) => offer.end));
      current.push({ ...game, start, end });
      continue;
    }
    const later = game.offers.filter((offer) => offer.start > now);
    if (later.length > 0) {
      const next = later.reduce((a, b) => (b.start < a.start ? b : a));
      upcoming.push({ ...game, start: next.start, end: next.end });
    }
  }
  const byDate = (key) => (a, b) => a[key] - b[key] || a.title.localeCompare(b.title);
  current.sort(byDate('end'));
  upcoming.sort(byDate('start'));
  return { current, upcoming };
}

/**
 * The dates at which the classification changes (a start or an end), in
 * epoch ms, sorted: the refresh schedule wakes up right after them.
 * @param {ReturnType<typeof parseGames>} games
 */
export function boundaries(games) {
  const dates = new Set();
  for (const game of games) {
    for (const offer of game.offers) {
      dates.add(offer.start);
      dates.add(offer.end);
    }
  }
  return [...dates].sort((a, b) => a - b);
}
