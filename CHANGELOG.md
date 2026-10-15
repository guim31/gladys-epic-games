# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- An _Epic Games Store_ device: the free games of the moment and the end of
  their offer, the next free games and the start of theirs, and how many of
  each. Texts and dates in the chosen language and the Gladys time zone.
- Mystery games (Christmas and Mega Sale teasers) shown as such until Epic
  reveals them.
- The _New free game available_ scene trigger, once per game that becomes
  free, with its title, end date, store link, publisher and usual price.
- The _Epic free games_ dashboard widget: posters, badges, dates, details and
  store links, as a grid or a list.
- The _Refresh now_ action in the Configuration screen.
- Language (English, French, German, Spanish) and store country settings; no
  account or API key needed.
- The store is read every 6 hours and right after each change of offer, and
  retried after a failure; the integration refreshes on its own, without
  relying on the Gladys polling.

[Unreleased]: https://github.com/guim31/gladys-epic-games/commits/main
