# Project Notes

## Layout

`MTG-API/` is a git submodule → <https://github.com/Vince-maple-byte/MTG-API>. Clone with `--recursive`, or run `git submodule update --init --recursive`.

Treat the submodule as read-only upstream unless the task is explicitly to patch it. Prefer fixes in the parent project; when patching upstream, expect the pinned commit to move on `git submodule update --remote`.

## MTG-API: What It Is

Express + Puppeteer scraper over mtgtop8.com, backed by MongoDB. Backend is `MTG-API/backend`; `index.js` there is the server entry point (port 3000, hardcoded).

## MTG-API: Persistence

Connection is hardcoded in `backend/mongoose/mongoose-script.js`, no env var, no auth:

```js
mongoose.connect('mongodb://127.0.0.1:27017/mtgscrapper');
```

Mongo **must** be listening on `27017` or the server will not start usefully.

Collections (`backend/mongoose/`):

| Model    | File               | Fields                                                        |
| -------- | ------------------ | ------------------------------------------------------------- |
| `Deck`   | `database.js`      | `deckName`, `deckImage`, `deckPercentage`, `format`, `formatVersion`, `url`, `cards[]` |
| `Card`   | `cardDatabase.js`  | ~55 Scryfall fields                                            |

Both schemas are `mongoose.SchemaTypes.Mixed` on every field except `Deck.format: String`. Consequences:

- No validation. Nothing rejects malformed writes.
- No indexes. `find({ format: 'Pauper' })` is a collection scan.
- Schema edits do not constrain or migrate existing documents.

**Scrape and read are separate verbs.** `GET` never scrapes — it reads Mongo only. `POST` scrapes mtgtop8 and writes. Data is stale until someone `POST`s.

**No upsert, no dedupe.** Writes are unconditional `new Deck(...).save()`. `POST` twice duplicates every row. `DELETE` the format before re-scraping.

**`Deck.cards` is unstructured.** Raw `textContent` from `.deck_line.hover_tr`, e.g. `"4 Duress"`. Parse name and count yourself. No reference to the `Card` collection.

**`Card` is never written.** No `new Card()`, no `insertMany` anywhere. `/card/*` routes read a collection you must populate externally. `backend/cards.txt` is dead — no code reads it.

## MTG-API: Known Defects

Verified against submodule commit `ea81f18`. Re-check before trusting.

**Wrong format scraped by the no-arg scrape path.** `backend/Decks/pauper.js:19` hardcodes `await page.goto('https://www.mtgtop8.com/format?f=EX')` — Extended — while the route tags the rows `format: 'Pauper'`. Same copy-paste defect in `modern`, `legacy`, `vintage`, `pioneer`, `standard`, `historic`, `peasant`, `highlander`, `extended`. The `alchemy`, `block`, `cedh`, `canadianHighlander`, `duel-commander`, and `explorer` modules use correct URLs.

The per-version functions (`pauperFormat()` etc.) use the module's `urlMap` and are correct. **Use `POST /pauper/last2Months`, not `POST /pauper`.**

**`GET /:format/:id` is broken.** Routes call `Deck.findMany()`, which is not a Mongoose method — it throws. Only the collection-level `GET /pauper` reads back.

**Async error handling is ineffective.** Several `/:id` handlers wrap `launch()` in `try/catch` without awaiting the returned promise, so thrown errors become unhandled rejections instead of 400 responses. In the same handlers `createDeck.save()` is not awaited, so the response can be sent before writes land.

**`node_modules` is committed.** 2598 of 2744 tracked files (95% of the repo), 21.4 MB of blobs, under `backend/node_modules`. `backend/.gitignore` *does* list `node_modules/`, but the rule landed in `666de05` (2023-07-15), two months after the files were committed in `ab2da51` (2023-05-25). `.gitignore` never untracks already-tracked paths, so `git check-ignore` reports them as not ignored. Expect churn against these committed copies on any `npm install`.

The committed tree buys nothing: Puppeteer's Chromium is still absent (`~/.cache/puppeteer` missing, `executablePath()` throws). `npm install` in `backend/` is required before scraping. Note `puppeteer@^19` against local Node v26.

## Pauper Format

Valid `:pauperId` keys come from `urlMap` in `backend/Decks/pauper.js`:

`last2Months`, `last4Months`, `liveTournaments`, `all2023Decks`, `all2022Decks`, `all2021Decks`, `all2020Decks`, `all2019Decks`, `all2018Decks`, `all2017Decks`, `all2016Decks`, `allPauperDecks`

`last2Months` maps to `format?f=PAU`, mtgtop8's current default view. Use it as the default Pauper case.

Working flow:

```bash
cd MTG-API/backend
npm ci                         # committed node_modules is broken, see above
node index.js                  # needs mongod on 27017

curl -X POST localhost:3000/pauper/last2Months   # scrape + save (~29s)
curl localhost:3000/pauper                       # read back
curl -X DELETE localhost:3000/pauper             # clear before re-scrape
```

## Verified Pauper Run

Confirmed working end to end against submodule `ea81f18`:

```bash
sudo docker run -d --name mtg-mongo -p 127.0.0.1:27017:27017 \
  -v mtg-mongo-data:/data/db mongo:7

cd MTG-API/backend && npm ci
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node index.js

curl -X POST localhost:3000/pauper/last2Months   # 29s
curl localhost:3000/pauper                        # 39 docs
```

Use `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (system Chromium 151 works fine against `puppeteer@19`) to avoid downloading a browser. Set `PUPPETEER_SKIP_DOWNLOAD=1` for `npm ci`.

`scripts/scrape-pauper.js` runs the scraper with no server and no Mongo — use it to check mtgtop8 markup is still parseable:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/scrape-pauper.js last2Months
```

Result of the verified run: 39 archetypes, 39 unique names, 0 decks without cards, 994 card lines, `deckPercentage` sums to 98%. Every `cards` line matches `/^(\d+)\s+(.+)$/` — parse with that regex to get count and name. Deck and card data are genuinely Pauper.

Two minor defects observed, both cosmetic:

- Every `url` contains a double slash (`mtgtop8.com//event?...`) because `mainUrl` ends in `/` and `href` starts with one. Both forms return HTTP 200.
- `POST /:pauperId` does not `await createDeck.save()`, so the 200 response can precede the writes. Re-poll `GET /pauper` rather than trusting the response timing.

## Our Scraper — prefer this over the submodule

`scripts/fetch-decks.js` replaces the submodule scraper for Pauper. `POST /pauper/:id` keeps only **39 of 377** available decklists because `Decks/pauper.js` collapses each archetype with `decksUrl[index][0]`. It also exposes no player, event or placing.

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  node scripts/fetch-decks.js --out data/pauper-last2Months.jsonl
```

Verified run: **377 decklists across 39 archetypes in 242s**, 9373 card lines, mainboard 60 for 358 lists (61 for 18, one outlier at 75/0), sideboard 15 for 376, `player`/`event`/`eventId`/`placing` populated on all 377. Writes JSONL incrementally, so an interrupted run keeps partial output.

Flags: `--view` (any `urlMap` key), `--out`, `--max-per-arch`, `--max-pages`, `--only`, `--limit-archetypes`, `--delay`, `--dry`.

### mtgtop8 markup facts (verified from live HTML)

These selectors are load-bearing and are *not* what the upstream scraper guesses at:

- Card rows are `.deck_line`. Their **`id` prefix encodes the section**: `md*` = main deck, `sb*` = sideboard. Use this, not heading text — there is no `.deck_title_line` element on current pages, which is why heading-based splitting silently puts all 75 cards in the mainboard.
- `.O14` divs are type group headings ("19 LANDS", "15 CREATURES", "26 INSTANTS and SORC.", "SIDEBOARD") and precede their cards in DOM order.
- `a.player_big` is the deck's own player. Plain `a.player` links are the *other* decks in the same event, so a naive `querySelector` grabs the wrong player.
- `.event_title` appears twice: first the tournament name, later `#<place> <deck variant> - `.
- `document.title` is `"<Variant> - <Player> @ mtgtop8.com"`.
- Archetype pages cap at 20 decklists and `&page=N` did **not** yield more — 377 appears to be the whole live 2-month field. Re-check if you need deeper history.

Related scripts: `scripts/probe-depth.js` (available lists per archetype), `scripts/scrape-pauper.js` (submodule scraper, no server/DB).

## Environment Gotchas

- Docker socket is not user-accessible on this machine (`dj` is not in group `docker`, and `sudo` requires a password). Mongo must be started with `sudo docker ...` by the operator.
- `npm ci` rewrites the committed `backend/node_modules`, dirtying the submodule working tree (~178 entries). Expected, not corruption.
