// -----------------------------------------------------------------------------
// The one device: the free games of the Epic Games Store.
//
// Read-only: four texts (titles and dates, in the configured language) and
// two counters. Its external ids are forever: the platform id is a constant,
// so changing the country or the language keeps the device, its history and
// the scenes built on it.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, TEXT, formatDate, pick } from './i18n.js';

export const DEVICE_TYPE = 'store';
export const PLATFORM_ID = 'free-games';

/** Feature keys: part of the external ids, never renamed. */
export const FEATURE = {
  CURRENT_TITLES: 'current_titles',
  CURRENT_END: 'current_end',
  CURRENT_COUNT: 'current_count',
  UPCOMING_TITLES: 'upcoming_titles',
  UPCOMING_START: 'upcoming_start',
  UPCOMING_COUNT: 'upcoming_count',
};

// A text state stays a line, not a page: a Christmas lineup lists a handful
// of titles at most.
const MAX_TEXT_LENGTH = 250;
// Bounds of the counters: display bounds, never applied by the core.
const MAX_COUNT = 50;

export function deviceIds(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
}

const textFeature = (ids, names, key) => ({
  name: names[key],
  external_id: ids.feature(key),
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  // NOT NULL in t_device_feature, text included: 422 on "Add" otherwise.
  min: 0,
  max: 0,
});

const counterFeature = (ids, names, key) => ({
  name: names[key],
  external_id: ids.feature(key),
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  min: 0,
  max: MAX_COUNT,
});

/**
 * The discovery payload of the device.
 *
 * Polled by the core once a minute (`should_poll` with a frequency of its
 * list) only as a fallback: the container refreshes itself with its own
 * timer (src/service.js), and onPoll skips while that timer runs.
 */
export function buildDevice(gladys, config) {
  const ids = deviceIds(gladys);
  const names = pick(FEATURE_NAMES, config.language);
  return {
    name: 'Epic Games Store',
    external_id: ids.device,
    model: 'free-games',
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      textFeature(ids, names, FEATURE.CURRENT_TITLES),
      textFeature(ids, names, FEATURE.CURRENT_END),
      counterFeature(ids, names, FEATURE.CURRENT_COUNT),
      textFeature(ids, names, FEATURE.UPCOMING_TITLES),
      textFeature(ids, names, FEATURE.UPCOMING_START),
      counterFeature(ids, names, FEATURE.UPCOMING_COUNT),
    ],
  };
}

/** The name a user reads for a game: the placeholder of a mystery game is translated. */
export function displayTitle(game, language) {
  return game.mystery ? pick(TEXT.mystery, language) : game.title;
}

function titles(games, language) {
  if (games.length === 0) {
    return pick(TEXT.none, language);
  }
  const text = games.map((game) => displayTitle(game, language)).join(' · ');
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text;
}

function firstDate(games, key, language, timeZone) {
  if (games.length === 0) {
    return pick(TEXT.noDate, language);
  }
  return formatDate(Math.min(...games.map((game) => game[key])), language, timeZone);
}

/**
 * The states of the device for a classification (see classify in src/epic.js).
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function buildStates(gladys, { current, upcoming }, config, timeZone) {
  const ids = deviceIds(gladys);
  const { language } = config;
  const text = (key, value) => ({ device_feature_external_id: ids.feature(key), text: value });
  const number = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  return [
    text(FEATURE.CURRENT_TITLES, titles(current, language)),
    // The earliest end: when a game leaves, the lineup changes.
    text(FEATURE.CURRENT_END, firstDate(current, 'end', language, timeZone)),
    number(FEATURE.CURRENT_COUNT, Math.min(current.length, MAX_COUNT)),
    text(FEATURE.UPCOMING_TITLES, titles(upcoming, language)),
    text(FEATURE.UPCOMING_START, firstDate(upcoming, 'start', language, timeZone)),
    number(FEATURE.UPCOMING_COUNT, Math.min(upcoming.length, MAX_COUNT)),
  ];
}
