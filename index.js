// -----------------------------------------------------------------------------
// Entry point of the Epic Games Store integration for Gladys Assistant.
//
// The wiring lives in src/app.js (shared with the tests). The Gladys
// supervisor provides GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR, read by the SDK; TZ is the Gladys time zone.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const app = registerHandlers(gladys);

// The SDK disconnects cleanly and exits with code 0 when the supervisor
// stops the container (SIGTERM/SIGINT).
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
  await app.service.store.flush();
});

logger.info('Starting the Epic Games Store integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
