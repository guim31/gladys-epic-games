// -----------------------------------------------------------------------------
// Every text the container writes, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js checks it).
//
// Two audiences: the device texts and the scene variables are written in the
// configured `language` (a device integration never receives the user's
// language), the widget in the language of the user looking at it.
// -----------------------------------------------------------------------------

import { DEFAULT_CONFIG, LANGUAGES } from './config.js';

/** Feature names, frozen by Gladys when the user adds the device. */
export const FEATURE_NAMES = {
  en: {
    current_titles: 'Free games',
    current_end: 'Free until',
    current_count: 'Free games now',
    upcoming_titles: 'Next free games',
    upcoming_start: 'Next free games from',
    upcoming_count: 'Free games coming',
  },
  fr: {
    current_titles: 'Jeux gratuits',
    current_end: "Gratuits jusqu'au",
    current_count: 'Jeux gratuits en ce moment',
    upcoming_titles: 'Prochains jeux gratuits',
    upcoming_start: 'Prochains jeux gratuits dès le',
    upcoming_count: 'Jeux gratuits à venir',
  },
  de: {
    current_titles: 'Gratisspiele',
    current_end: 'Gratis bis',
    current_count: 'Gratisspiele jetzt',
    upcoming_titles: 'Nächste Gratisspiele',
    upcoming_start: 'Nächste Gratisspiele ab',
    upcoming_count: 'Kommende Gratisspiele',
  },
  es: {
    current_titles: 'Juegos gratis',
    current_end: 'Gratis hasta',
    current_count: 'Juegos gratis ahora',
    upcoming_titles: 'Próximos juegos gratis',
    upcoming_start: 'Próximos juegos gratis desde',
    upcoming_count: 'Juegos gratis próximos',
  },
};

/** Short texts: device values, widget labels and badges. */
export const TEXT = {
  // A text state is never empty (Gladys ignores an empty one).
  none: { en: 'None', fr: 'Aucun', de: 'Keins', es: 'Ninguno' },
  noDate: { en: '—', fr: '—', de: '—', es: '—' },
  mystery: { en: 'Mystery game', fr: 'Jeu mystère', de: 'Mystery-Spiel', es: 'Juego misterioso' },
  freeBadge: { en: 'Free', fr: 'Gratuit', de: 'Gratis', es: 'Gratis' },
  soonBadge: { en: 'Soon', fr: 'Bientôt', de: 'Bald', es: 'Pronto' },
  storeLink: {
    en: 'Open in the store',
    fr: 'Voir sur la boutique',
    de: 'Im Store ansehen',
    es: 'Ver en la tienda',
  },
  allFreeGames: {
    en: 'All free games',
    fr: 'Tous les jeux gratuits',
    de: 'Alle Gratisspiele',
    es: 'Todos los juegos gratis',
  },
};

/** Sentences: widget states, action messages, connection statuses. */
export const MESSAGES = {
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  invalidCountry: {
    en: 'The country must be a two-letter code, such as FR, BE or US.',
    fr: 'Le pays doit être un code de deux lettres, comme FR, BE ou US.',
    de: 'Das Land muss ein Code aus zwei Buchstaben sein, zum Beispiel DE, AT oder CH.',
    es: 'El país debe ser un código de dos letras, como ES, MX o AR.',
  },
  unknownCountry: {
    en: 'The Epic Games Store does not know this country: check its two-letter code.',
    fr: "L'Epic Games Store ne connaît pas ce pays : vérifiez son code de deux lettres.",
    de: 'Der Epic Games Store kennt dieses Land nicht: Prüfe den Code aus zwei Buchstaben.',
    es: 'La Epic Games Store no conoce este país: compruebe su código de dos letras.',
  },
  unreachable: {
    en: 'The Epic Games Store does not answer, new attempt in a few minutes.',
    fr: "L'Epic Games Store ne répond pas, nouvel essai dans quelques minutes.",
    de: 'Der Epic Games Store antwortet nicht, neuer Versuch in ein paar Minuten.',
    es: 'La Epic Games Store no responde, nuevo intento dentro de unos minutos.',
  },
  loading: {
    en: 'Reading the free games of the Epic Games Store…',
    fr: "Lecture des jeux gratuits de l'Epic Games Store…",
    de: 'Die Gratisspiele des Epic Games Store werden gelesen …',
    es: 'Leyendo los juegos gratis de la Epic Games Store…',
  },
  noGames: {
    en: 'No free game announced at the moment.',
    fr: "Aucun jeu gratuit annoncé pour l'instant.",
    de: 'Im Moment ist kein Gratisspiel angekündigt.',
    es: 'No hay ningún juego gratis anunciado por ahora.',
  },
};

/** The text of a table in a language, French when the language is unknown. */
export function pick(table, language) {
  return table[language] ?? table[DEFAULT_CONFIG.language];
}

/** A multi-language object `{ en, fr, de, es }` built by a function of the language. */
export function allLanguages(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

const DATE_LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/**
 * A date as a user reads it: "Thu 22 Oct, 17:00" in the Gladys time zone
 * (TZ, injected by the supervisor), without the year — offers last a week.
 * @param {number} ms epoch ms
 * @param {string} language
 * @param {string} [timeZone] defaults to the process time zone
 */
export function formatDate(ms, language, timeZone) {
  return new Intl.DateTimeFormat(DATE_LOCALES[language] ?? DATE_LOCALES.fr, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(ms));
}

/** "until Thu 22 Oct, 17:00", for a current game. */
export const UNTIL = {
  en: (date) => `Free until ${date}`,
  fr: (date) => `Gratuit jusqu'au ${date}`,
  de: (date) => `Gratis bis ${date}`,
  es: (date) => `Gratis hasta el ${date}`,
};

/** "from Thu 22 Oct, 17:00", for an upcoming game. */
export const FROM = {
  en: (date) => `Free from ${date}`,
  fr: (date) => `Gratuit dès le ${date}`,
  de: (date) => `Gratis ab ${date}`,
  es: (date) => `Gratis desde el ${date}`,
};

/** The caption of the widget: what is free now and what comes. */
export const SUMMARY = {
  en: (current, upcoming) => `${current} free now · ${upcoming} coming`,
  fr: (current, upcoming) => `${current} gratuit(s) · ${upcoming} à venir`,
  de: (current, upcoming) => `${current} jetzt gratis · ${upcoming} kommen`,
  es: (current, upcoming) => `${current} gratis ahora · ${upcoming} próximos`,
};

/** Answer of the "Refresh now" action. */
export const REFRESH_REPORT = {
  en: { current: 'Free now', upcoming: 'Coming', none: 'none' },
  fr: { current: 'Gratuits', upcoming: 'À venir', none: 'aucun' },
  de: { current: 'Jetzt gratis', upcoming: 'Demnächst', none: 'keins' },
  es: { current: 'Gratis ahora', upcoming: 'Próximos', none: 'ninguno' },
};

/** The message of a failed refresh, for the Configuration screen. */
export const REFRESH_FAILED = {
  en: (reason) => `The Epic Games Store could not be read: ${reason}`,
  fr: (reason) => `Impossible de lire l'Epic Games Store : ${reason}`,
  de: (reason) => `Der Epic Games Store konnte nicht gelesen werden: ${reason}`,
  es: (reason) => `No se ha podido leer la Epic Games Store: ${reason}`,
};
