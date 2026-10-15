# Epic Games Store for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration that follows the **weekly free games
of the Epic Games Store**: what is free right now and until when, what comes next and from when, a
dashboard widget with the posters and store links, and a scene trigger fired once per new free game.

No account, no API key: it reads the public list the store's own "Free games" page reads.

> Not affiliated with, endorsed or sponsored by Epic Games, Inc. "Epic Games" and "Epic Games Store"
> are trademarks of Epic Games, Inc.

> **Developed without access to the live API: feedback welcome.** The development session could not
> reach the store; the integration was built and tested on real recorded answers of the endpoint
> (those of the Home Assistant integration tests, see Credits). `scripts/probe.mjs` checks it against
> the live store.

## Features

- **One read-only device**, _Epic Games Store_: the titles of the free games of the moment, the end
  of the offer, their number; the titles of the next free games, the start of their offer, their
  number. Texts and dates in the configured language and in the Gladys time zone.
- **Mystery games** (Christmas, Mega Sale teasers) are shown as "Mystery game" until Epic reveals
  them, and linked to the store's free games page.
- **Scene trigger** _New free game available_: once per game that becomes free, with its title, end
  date (readable and ISO 8601), store link, publisher and usual price. Never fired for the games
  already free at the very first read, never twice for one game (remembered in `/data`).
- **Dashboard widget** _Epic free games_: a poster grid (or a list) of the free and coming games,
  with a badge, the date, a detail panel (description, publisher, price) and the store link. The
  posters are downloaded and resized by the integration: the browser never contacts Epic.
- **Refresh now** action in the Configuration screen, with the lineup as answer.
- English, French, German and Spanish everywhere.

## Requirements

- Gladys Assistant **5.1.0** or later.
- Internet access from Gladys.

## Installation

1. In Gladys, open **Integrations**, find **Epic Games Store** in the catalog and install it — or
   use **Integrations → Install from GitHub** with `https://github.com/guim31/gladys-epic-games`.
2. In **Configuration**, pick the language and the store country (two letters, `FR` by default).
3. Open the **Discovery** tab and add the _Epic Games Store_ device.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

- The container reads
  `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=…&country=…`
  every 6 hours, then 2 and 30 minutes after each start or end of an offer (Thursday 17:00 Paris
  time, daily during the Christmas giveaway): 6 to 8 requests a day to a CDN-served endpoint, with an
  identifying user agent. After a failure it retries in 5, 15, 30, then 60 minutes.
- A game is free **by its dates**, read against the clock every minute: it switches to "free now" at
  its start time even before the next read.
- The integration drives its own one-minute timer (Gladys does not poll external devices reliably,
  GladysAssistant/Gladys#3198); the device is still published with `should_poll` so the core's
  `onPoll` is a fallback when the timer stalls.
- Only changed states are published, plus every 6 hours a heartbeat of the unchanged ones.
- The widget's posters come from Epic's CDN (`*.epicgames.com` only, https), asked at the size the
  grid renders, and checked against the core's bounds before being served.

## Limitations

- The endpoint is undocumented: Epic may change it without notice.
- Free games only, not discounts. Whether you already claimed a game needs an Epic account: out of
  scope.
- The mobile-store giveaways are not covered.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test                          # node --test, on the SDK's fake Gladys and recorded answers
npm run lint
npm run format:check
node scripts/probe.mjs FR fr      # read-only probe of the live store and its posters
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js            SDK wiring (src/app.js registers the handlers)
src/app.js          handlers: discovery, poll fallback, device created, config, action, widget
src/service.js      own timer, reads, states, scene trigger, connection status
src/epic.js         store client and parsing (free offers, mystery games, links)
src/schedule.js     when to read the store
src/device.js       the device, its features and states
src/widgets.js      the "Epic free games" widget content
src/images.js       posters: registry, resizing, validation
src/i18n.js         every text, in four languages
src/store.js        /data persistence (games already announced)
test/               node --test; test/fixtures/epic: real answers (Home Assistant tests)
scripts/probe.mjs   read-only probe of the live store
```

`test/gladys-rules.test.js` checks the device against the category/type table extracted from the
Gladys core.

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="epic-games-store" \
EPIC_DATA_DIR=./data \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by hand. A
hand-pushed `vX.Y.Z` tag also builds the image and the GitHub Release, but then `version` in
`package.json` and in the manifest (with the `docker_image` tag) must be bumped and committed before
tagging. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Home Assistant's
  [`epic_games_store`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/epic_games_store)
  integration by @Quentame and contributors (Apache-2.0): the endpoint, the
  parsing of the offers and of the store links, and the test fixtures in `test/fixtures/epic/`,
  real answers of the store copied from its test suite.
- [epicstore_api](https://github.com/SD4RK/epicstore_api) by SD4RK, the library the Home Assistant
  integration uses: read to understand the endpoint, no code copied.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
