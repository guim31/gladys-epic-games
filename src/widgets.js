// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+): the free games of the moment and the next
// ones, as a poster grid (or a list), each with its store link.
//
// The content is built here by a pure function of what the service knows;
// src/app.js registers it. Texts are in the language of the user looking at
// the dashboard (the core caches one content per language), dates are sent
// raw (ISO) and formatted by the core in the user's locale and time zone,
// except inside the sentences, formatted in the Gladys time zone.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { freeGamesPageUrl } from './epic.js';
import { displayTitle } from './device.js';
import { FROM, MESSAGES, SUMMARY, TEXT, UNTIL, formatDate, pick } from './i18n.js';

/** Widget key, as declared in the manifest `widgets` field: frozen once published. */
export const WIDGET_KEY = 'free_games';

export const DISPLAYS = ['grid', 'list'];
const MAX_ITEMS = { grid: 12, list: 8 };
const MAX_DESCRIPTION = 2000;

// The lineup changes once a week; the service nudges the widget on every
// change, the TTL is only the safety net.
export const TTL_SECONDS = 1800;

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function item(game, state, { language, timeZone, register }) {
  const date = state === 'current' ? game.end : game.start;
  const sentence = (state === 'current' ? UNTIL : FROM)[language] ?? UNTIL.fr;
  const when = sentence(formatDate(date, language, timeZone));
  const details = [game.publisher, game.originalPrice].filter(Boolean).join(' · ');
  const description = [when, details, game.mystery ? null : game.description]
    .filter(Boolean)
    .join('\n\n');
  const image = register(game.image);
  return {
    title: cut(displayTitle(game, language), 60),
    subtitle: cut(when, 60),
    // In a grid the date shows in place of the subtitle: the end of a free
    // game, the start of a coming one, told apart by the badge.
    date: new Date(date).toISOString(),
    ...(image ? { image } : {}),
    badge:
      state === 'current'
        ? { text: pick(TEXT.freeBadge, language), color: WIDGET_COLORS.SUCCESS }
        : { text: pick(TEXT.soonBadge, language), color: WIDGET_COLORS.INFO },
    description: cut(description, MAX_DESCRIPTION),
    links: [{ url: game.url, label: pick(TEXT.storeLink, language) }],
  };
}

/**
 * The widget content.
 * @param {object} options
 * @param {{ current: Array, upcoming: Array }|null} options.view the classified games, null before the first read
 * @param {string|null} options.problem a sentence key of MESSAGES when the last read failed
 * @param {string} options.language the language of the user looking at the dashboard
 * @param {string} [options.display] `grid` (default) or `list`
 * @param {string} [options.timeZone]
 * @param {(url: string) => string|null} options.register poster URL → image key
 */
export function buildWidgetContent({ view, problem, language, display, timeZone, register }) {
  const mode = DISPLAYS.includes(display) ? display : 'grid';
  const storeButton = {
    type: 'button',
    label: pick(TEXT.allFreeGames, language),
    icon: 'external-link',
    link: { url: freeGamesPageUrl(language) },
  };
  const components = [];
  if (problem) {
    components.push({ type: 'text', variant: 'body', text: pick(MESSAGES[problem], language) });
  }
  if (view === null) {
    if (!problem) {
      components.push({ type: 'text', variant: 'body', text: pick(MESSAGES.loading, language) });
    }
    return { ttl_seconds: 60, components: [...components, storeButton] };
  }
  const { current, upcoming } = view;
  if (current.length + upcoming.length === 0) {
    if (!problem) {
      components.push({ type: 'text', variant: 'body', text: pick(MESSAGES.noGames, language) });
    }
    return { ttl_seconds: TTL_SECONDS, components: [...components, storeButton] };
  }
  const summary = SUMMARY[language] ?? SUMMARY.fr;
  const context = { language, timeZone, register };
  const items = [
    ...current.map((game) => item(game, 'current', context)),
    ...upcoming.map((game) => item(game, 'upcoming', context)),
  ].slice(0, MAX_ITEMS[mode]);
  components.push(
    { type: 'text', variant: 'caption', text: summary(current.length, upcoming.length) },
    { type: 'card-list', display: mode, items },
    storeButton,
  );
  // A failed read keeps the last lineup on screen, under its warning.
  return { ttl_seconds: problem ? 300 : TTL_SECONDS, components };
}
