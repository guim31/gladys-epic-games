// -----------------------------------------------------------------------------
// The service: reads the store on its own schedule, publishes the device
// states, announces the new free games to the scenes, feeds the widget.
//
// Its own timer, not the core's polling: Gladys 5.2 does not poll external
// devices reliably (GladysAssistant/Gladys#3198, still open in 5.2.1), so a
// one-minute ticker drives everything, and the core's onPoll only runs the
// same tick when the ticker has not run for a while. Each tick:
//   1. reads the store when the schedule says so (src/schedule.js: 6 to 8
//      reads a day, right after each switch);
//   2. classifies the games against the clock — a game becomes current at
//      its start time even before the next read;
//   3. publishes the states that changed (and every 6 hours the others: the
//      front shows "no recent value" past 48 hours);
//   4. announces, once, every game that became free (scene trigger).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES, normalizeConfig } from './config.js';
import { buildDevice, buildStates, deviceIds, displayTitle } from './device.js';
import { EpicApiError, boundaries, classify, fetchPromotions, parseGames } from './epic.js';
import {
  MESSAGES,
  REFRESH_FAILED,
  REFRESH_REPORT,
  UNTIL,
  allLanguages,
  formatDate,
  pick,
} from './i18n.js';
import { createImageRegistry } from './images.js';
import { createIssueLog } from './issues.js';
import { MINUTE_MS, nextRefreshAt } from './schedule.js';
import { Store } from './store.js';
import { WIDGET_KEY, buildWidgetContent } from './widgets.js';

const logger = createLogger({ name: 'epic' });

/** Scene trigger key, declared in the manifest `scene_triggers`: frozen once published. */
export const NEW_FREE_GAME_TRIGGER = 'new_free_game';

export const TICK_MS = MINUTE_MS;
// Re-send an unchanged state this often: under the 12 h the maintainer
// notes ask for, far under the 48 h after which the front shows no value.
export const HEARTBEAT_MS = 6 * 60 * MINUTE_MS;
// The announced games are forgotten a month after their offer ended.
const ANNOUNCED_RETENTION_MS = 30 * 24 * 60 * MINUTE_MS;
// Epic's GraphQL code for an unknown country (error_5222_wrong_country.json).
const UNKNOWN_COUNTRY_CODE = 5222;
const MAX_VARIABLE_LENGTH = 1000;

/** The key of one free period of one game: the same game free again next year is new. */
export const announcementKey = (game) => `${game.id}@${new Date(game.start).toISOString()}`;

export class EpicService {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} [options.store] persistence (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] run the ticker (tests drive the ticks themselves)
   * @param {number} [options.tickMs]
   * @param {string} [options.timeZone] defaults to the process one (TZ)
   * @param {string} [options.userAgent]
   */
  constructor({
    gladys,
    store = new Store(),
    fetch: doFetch = fetch,
    now = () => Date.now(),
    timers = true,
    tickMs = TICK_MS,
    timeZone,
    userAgent,
  }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = doFetch;
    this.now = now;
    this.timers = timers;
    this.tickMs = tickMs;
    this.timeZone = timeZone;
    this.userAgent = userAgent;
    this.config = normalizeConfig();
    this.images = createImageRegistry({ fetch: doFetch });
    this.issues = createIssueLog(logger);

    this.games = null;
    this.lastSuccessAt = null;
    this.lastAttemptAt = null;
    this.failures = 0;
    this.problem = null;
    this.connected = null;
    this.lastTickAt = null;
    this.reading = null;
    this.ticking = null;
    this.widgetSignature = null;
    this.firstReadLogged = false;

    this.announced = {};
    this.seeded = false;
    this.ticker = null;
  }

  // --- Lifecycle -------------------------------------------------------------

  /** First connection: load what /data remembers, publish the device, read the store. */
  async start(config) {
    const saved = await this.store.load();
    this.announced = saved.announced && typeof saved.announced === 'object' ? saved.announced : {};
    this.seeded = saved.seeded === true && saved.country === config.country;
    this.config = config;
    // The ticker first: a refused publication must not stop the refreshes.
    this.startTicker();
    await this.publishDevice();
    await this.tick({ force: true });
  }

  /** A reconnection: Gladys may have restarted and lost the last states. */
  async resync(config) {
    const countryChanged = config.country !== this.config.country;
    this.config = config;
    await this.publishDevice();
    this.gladys.forgetPublishedStates();
    this.widgetSignature = null;
    if (countryChanged) {
      this.resetLineup();
    }
    await this.tick({ force: countryChanged });
  }

  /** New configuration from the user: another language or country is read at once. */
  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const changed = config.language !== previous.language || config.country !== previous.country;
    logger.info(`Configuration updated (language ${config.language}, country ${config.country})`);
    await this.publishDevice();
    if (config.country !== previous.country) {
      this.resetLineup();
    }
    if (changed) {
      // The texts change language: everything is sent again.
      this.gladys.forgetPublishedStates();
      this.widgetSignature = null;
    }
    await this.tick({ force: changed });
  }

  stop() {
    clearInterval(this.ticker);
    this.ticker = null;
  }

  startTicker() {
    if (!this.timers || this.ticker) {
      return;
    }
    this.ticker = setInterval(() => {
      this.tick().catch((err) => logger.error(`Refresh cycle failed (${err.message})`));
    }, this.tickMs);
    this.ticker.unref?.();
  }

  /**
   * Another country: another lineup, and nothing announced in it yet. The
   * games already free there are not "new": the next read seeds them.
   */
  resetLineup() {
    this.games = null;
    this.lastSuccessAt = null;
    this.lastAttemptAt = null;
    this.failures = 0;
    this.seeded = false;
    this.announced = {};
  }

  async publishDevice() {
    await this.gladys.publishDiscoveredDevices([buildDevice(this.gladys, this.config)]);
  }

  // --- The cycle ---------------------------------------------------------------

  /**
   * One cycle (the ticker, the core's onPoll, a new device…). Concurrent
   * callers share the cycle in progress.
   * @param {{ force?: boolean }} [options] force: read the store now
   */
  async tick({ force = false } = {}) {
    while (this.ticking) {
      await this.ticking.catch(() => {});
      if (!force) {
        return;
      }
    }
    this.ticking = (async () => {
      this.lastTickAt = this.now();
      if (this.gladys.connected === false) {
        logger.debug('Gladys unreachable: cycle skipped');
        return;
      }
      if (force || this.now() >= this.nextRefreshAt()) {
        await this.read();
      }
      await this.publish();
    })();
    try {
      await this.ticking;
    } finally {
      this.ticking = null;
    }
  }

  /** The core's onPoll, every minute when it works: only when the ticker is late. */
  async poll() {
    if (this.lastTickAt !== null && this.now() - this.lastTickAt < this.tickMs / 2) {
      logger.debug('onPoll skipped: the ticker just ran');
      return;
    }
    await this.tick();
  }

  nextRefreshAt() {
    return nextRefreshAt({
      now: this.now(),
      lastSuccessAt: this.lastSuccessAt,
      lastAttemptAt: this.lastAttemptAt,
      failures: this.failures,
      boundaries: this.games ? boundaries(this.games) : [],
    });
  }

  /** Read the store once; a failure is remembered and reported, never thrown. */
  async read() {
    if (!this.config.countryValid) {
      this.failures += 1;
      this.lastAttemptAt = this.now();
      await this.setProblem('invalidCountry', `Invalid country "${this.config.country}"`);
      return;
    }
    this.lastAttemptAt = this.now();
    try {
      const payload = await fetchPromotions(this.config, {
        fetch: this.fetch,
        userAgent: this.userAgent,
      });
      this.games = parseGames(payload, this.config.language);
      this.lastSuccessAt = this.now();
      this.failures = 0;
      this.issues.ok('read', 'Epic Games Store answers again');
      await this.clearProblem();
      const view = classify(this.games, this.now());
      const message =
        `Epic Games Store read (${this.config.country}): ` +
        `${view.current.length} free, ${view.upcoming.length} coming`;
      if (this.firstReadLogged) {
        logger.debug(message);
      } else {
        // Once per start: the "connected" line of a cloud service.
        logger.info(message);
        this.firstReadLogged = true;
      }
    } catch (err) {
      this.failures += 1;
      const unknownCountry = err instanceof EpicApiError && err.code === UNKNOWN_COUNTRY_CODE;
      await this.setProblem(unknownCountry ? 'unknownCountry' : 'unreachable', err.message);
    }
  }

  async setProblem(problem, detail) {
    this.issues.fail('read', `Epic Games Store not read: ${detail}`);
    if (this.problem !== problem || this.connected !== false) {
      this.problem = problem;
      this.connected = false;
      await this.gladys.setConnectionStatus(false, MESSAGES[problem]).catch(() => {});
    }
  }

  async clearProblem() {
    this.problem = null;
    if (this.connected !== true) {
      this.connected = true;
      await this.gladys.setConnectionStatus(true).catch(() => {});
    }
  }

  /** The games free now and soon, null before the first successful read. */
  view() {
    return this.games ? classify(this.games, this.now()) : null;
  }

  /** Publish the changed states, announce the new games, nudge the widget. */
  async publish() {
    const view = this.view();
    if (view === null) {
      this.nudgeWidget(null);
      return;
    }
    await this.announce(view);
    // Gladys drops the states of a device not added yet: they are sent when
    // the user adds it (onDeviceCreated).
    if (this.isDeviceCreated()) {
      try {
        await this.gladys.publishChangedStates(
          buildStates(this.gladys, view, this.config, this.timeZone),
          { heartbeat: HEARTBEAT_MS },
        );
        this.issues.ok('states', 'States published again');
      } catch (err) {
        this.issues.fail('states', `States not published: ${err.message}`);
      }
    }
    this.nudgeWidget(view);
  }

  isDeviceCreated() {
    const id = deviceIds(this.gladys).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  /** Ask the dashboards to re-pull the widget when what it shows changed. */
  nudgeWidget(view) {
    const signature = JSON.stringify([
      this.problem,
      view &&
        [...view.current, ...view.upcoming].map((game) => [
          game.id,
          game.title,
          game.start,
          game.end,
          view.current.includes(game),
        ]),
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene trigger -----------------------------------------------------------

  /**
   * Fire `new_free_game` once per game that became free. The very first
   * lineup read is remembered without being announced: installing the
   * integration on a Saturday must not announce the game free since Thursday.
   * A mystery game is announced once revealed, under its real title.
   */
  async announce(view) {
    const now = this.now();
    let changed = false;
    for (const [key, end] of Object.entries(this.announced)) {
      if (!Number.isFinite(end) || end < now - ANNOUNCED_RETENTION_MS) {
        delete this.announced[key];
        changed = true;
      }
    }
    for (const game of view.current) {
      const key = announcementKey(game);
      if (game.mystery || this.announced[key] !== undefined) {
        continue;
      }
      if (this.seeded) {
        try {
          await this.gladys.publishSceneEvent(NEW_FREE_GAME_TRIGGER, this.eventData(game));
          logger.info(`New free game announced: ${game.title}`);
        } catch (err) {
          // Not remembered: announced at the next cycle.
          this.issues.fail('announce', `Free game not announced (${err.message})`);
          continue;
        }
        this.issues.ok('announce', 'Free games announced again');
      }
      this.announced[key] = game.end;
      changed = true;
    }
    if (!this.seeded) {
      this.seeded = true;
      changed = true;
    }
    if (changed) {
      await this.store.save({
        version: 1,
        country: this.config.country,
        seeded: this.seeded,
        announced: this.announced,
      });
    }
  }

  /** The scene variables of one game, in the configured language. */
  eventData(game) {
    const { language } = this.config;
    const bound = (text) => (text ? String(text).slice(0, MAX_VARIABLE_LENGTH) : null);
    return {
      title: bound(displayTitle(game, language)),
      ends_at: formatDate(game.end, language, this.timeZone),
      ends_at_iso: new Date(game.end).toISOString(),
      url: bound(game.url),
      publisher: bound(game.publisher),
      original_price: bound(game.originalPrice),
    };
  }

  // --- User surfaces -------------------------------------------------------------

  /** "Refresh now" (Configuration screen): read, then say what is free. */
  async refreshNow() {
    logger.info('Action refresh: reading the Epic Games Store now');
    await this.tick({ force: true });
    if (this.problem) {
      return allLanguages((language) =>
        (REFRESH_FAILED[language] ?? REFRESH_FAILED.fr)(pick(MESSAGES[this.problem], language)),
      );
    }
    const view = this.view();
    if (view === null) {
      return MESSAGES.loading;
    }
    return allLanguages((language) => {
      const words = pick(REFRESH_REPORT, language);
      const list = (games) =>
        games.length === 0
          ? words.none
          : games.map((game) => displayTitle(game, language)).join(', ');
      const until =
        view.current.length > 0
          ? ` (${(UNTIL[language] ?? UNTIL.fr)(formatDate(view.current[0].end, language, this.timeZone))})`
          : '';
      const text = `${words.current}: ${list(view.current)}${until}. ${words.upcoming}: ${list(view.upcoming)}.`;
      // The message shown under the button holds 200 characters.
      return text.length > 200 ? `${text.slice(0, 199)}…` : text;
    });
  }

  /** The widget content, in the language of the user looking at it. */
  widgetContent({ settings = {}, language } = {}) {
    return buildWidgetContent({
      view: this.view(),
      problem: this.problem,
      // A user language the integration does not write: English.
      language: LANGUAGES.includes(language) ? language : 'en',
      display: settings.display,
      timeZone: this.timeZone,
      register: (url) => this.images.register(url),
    });
  }

  async widgetImage(key) {
    try {
      const image = await this.images.resolve(key);
      this.issues.ok('image', 'Posters served again');
      return image;
    } catch (err) {
      this.issues.fail('image', err.message);
      throw err;
    }
  }
}
