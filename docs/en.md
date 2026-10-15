# Epic Games Store

Every week, the Epic Games Store gives away one or more PC games, yours to keep once claimed. This
integration follows these offers in Gladys: the free games of the moment and when they end, the next
ones and when they start, a widget with the posters, and a scene trigger to be told as soon as a new
game is available.

It is **read-only**: it does not claim the games for you, it tells you when to go and get them.

> Unofficial integration, not affiliated with Epic Games. Epic Games Store is a trademark of Epic
> Games, Inc.

> **Developed without access to the live API**: it was built on recorded answers of the store (the
> ones of the Home Assistant integration tests). Feedback welcome.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets and scene triggers).
- Internet access from Gladys. No Epic account, no API key.

## Configuration

1. Install the integration from the catalog (or **Integrations → Install from GitHub**).
2. In the **Configuration** tab:
   - **Language**: the language of the device texts, of the scene variables and of the store titles
     and links (French by default);
   - **Country**: the two-letter code of your store region (`FR` by default, `US`, `GB`, `CA`…).
     The free games can differ from one country to another.
3. Save, then open the **Discovery** tab and add the **Epic Games Store** device.

The **Refresh now** button reads the store at once and shows, under the button, the free games of
the moment and the next ones: handy to check the chosen country.

## The device

One device, **Epic Games Store**, read-only:

| Feature              | Content                                                  |
| -------------------- | -------------------------------------------------------- |
| Free games           | The titles of the games free right now, separated by "·" |
| Free until           | The end of the offer (the earliest if there are several) |
| Free games now       | Their number                                             |
| Next free games      | The titles of the next announced games                   |
| Next free games from | The start of the next offer                              |
| Free games coming    | Their number                                             |

Dates are written in the Gladys time zone, for example "Thu 22 Oct, 17:00". Without a game, the
titles read "None" and the dates "—".

During special events (Christmas, Mega Sale), Epic announces **mystery games**: they show as
"Mystery game" until Epic reveals them.

Gladys sets the feature names when the device is added, in the language chosen at that time.
Changing the language afterwards translates the values, not the names.

## The widget

Add the **Epic free games** widget to the dashboard:

- a summary line ("2 free now · 2 coming");
- the free games then the next ones, with their poster, a **Free** or **Soon** badge and the date
  (the end for a free game, the start for a coming one);
- tapping a game: the date, the publisher, the usual price, the description and the store link;
- an **All free games** button to the store page.

**Display** setting: poster grid (default) or list. The widget is written in the language of the
user looking at it; the posters are downloaded and resized by the integration, your browser never
contacts Epic.

## The scene trigger

**New free game available** fires **once per game**, when it becomes free (on Thursday around
17:00 Paris time, and every day during the Christmas giveaway). It gives the scene:

| Variable                   | Example                                             |
| -------------------------- | --------------------------------------------------- |
| Game title                 | Filament                                            |
| Free until (date and time) | Thu 10 Nov, 17:00                                   |
| Free until (ISO 8601)      | 2022-11-10T16:00:00.000Z                            |
| Store link                 | https://store.epicgames.com/en-US/p/filament-332a92 |
| Publisher                  | Kasedo Games Ltd                                    |
| Usual price                | €16.99                                              |

Good to know:

- at the very first read, the games already free are **not** announced (installing the integration
  on a Saturday does not announce the game given away since Thursday);
- a mystery game is announced once revealed, under its real title;
- the games already announced are kept in `/data`: a restart or an update never announces them a
  second time;
- changing the country starts over: the games already free in the new country are not announced.

The integration has no scene action: the device values are enough for a condition.

## Scene examples

- **Notification**: trigger "New free game available", then the "Send a message" action:
  "🎮 Game title is free until Free until (date and time): Store link", inserting each variable from
  the editor's picker.
- **Reminder before the end**: every Wednesday at 19:00, if **Free games now** is above 0, send
  "Last day to claim the Epic free games!".
- **Voice announcement**: trigger "New free game available", condition "between 09:00 and 22:00",
  then have the speaker say the game title.

## Troubleshooting

- **"The Epic Games Store does not answer"** in the Configuration tab: Gladys cannot reach the store
  (Internet, DNS, firewall). The integration tries again after 5, 15, 30 then 60 minutes and keeps
  the last known games meanwhile.
- **"The Epic Games Store does not know this country"**: the store does not know the country code.
  Use a two-letter ISO code (`FR`, `US`, `GB`, `CA`…).
- **The values do not show**: the device must have been added from the Discovery tab; the values
  are sent as soon as it is.
- **The trigger did not fire**: it only fires for a game that _becomes_ free while the integration
  runs (see above).
- **More details**: add the `LOG_LEVEL=debug` environment variable and read the integration logs.
  Normally, it only writes at startup, for each new game and when something goes wrong.

## Limitations

- The integration reads the public address the store's own "Free games" page uses
  (`store-site-backend-static.ak.epicgames.com/freeGamesPromotions`). Epic does not document it and
  may change it without notice.
- It reads it 6 to 8 times a day: every 6 hours, then 2 and 30 minutes after each change of offer.
  Epic publishes no quota for this CDN-served address; this pace stays that of a visitor.
- Only **free** games are followed, not the discounts.
- The store does not say whether you already claimed a game: that needs an Epic account, and the
  integration uses none.
- The games given away on the Epic Games Store mobile app are not covered.
