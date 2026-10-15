// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the service, so index.js stays a few lines and the
// tests drive the very same wiring.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { deviceIds } from './device.js';
import { MESSAGES } from './i18n.js';
import { EpicService } from './service.js';
import { WIDGET_KEY } from './widgets.js';

const logger = createLogger({ name: 'app' });

/** The action of the Configuration screen: frozen once published. */
export const REFRESH_ACTION = 'refresh';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const USER_AGENT = `gladys-epic-games/${version} (+https://github.com/guim31/gladys-epic-games)`;

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, fetch, now, timers, tickMs, timeZone
 * @returns {{ service: EpicService, ready: Promise<void>, stop: () => void }}
 */
export function registerHandlers(gladys, options = {}) {
  const service = new EpicService({ gladys, userAgent: USER_AGENT, ...options });

  // Resolved once the service has started; every handler waits for it, so a
  // command arriving during the first read is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        await service.resync(config);
        return;
      }
      started = true;
      await service.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => service.publishDevice()));

  // Fallback of the container's own ticker (src/service.js).
  gladys.onPoll(whenReady(() => service.poll()));

  // The SDK forgot what it had published for the device: send everything
  // now (Gladys drops the states of a feature that did not exist yet), and
  // let the widget bind its tiles to the new device.
  gladys.onDeviceCreated(
    whenReady(async (device) => {
      if (device.external_id !== deviceIds(gladys).device) {
        return;
      }
      logger.info('Device added to Gladys: publishing its states');
      await service.publish();
      gladys.requestWidgetRefresh(WIDGET_KEY);
    }),
  );

  gladys.onConfigUpdated(whenReady((newConfig) => service.reconfigure(normalizeConfig(newConfig))));

  gladys.onAction(
    REFRESH_ACTION,
    whenReady(() => service.refreshNow()),
  );

  gladys.onWidgetGet(
    WIDGET_KEY,
    whenReady((request) => service.widgetContent(request)),
  );
  gladys.onWidgetGetImage(whenReady((imageKey) => service.widgetImage(imageKey)));

  return { service, ready, stop: () => service.stop() };
}
