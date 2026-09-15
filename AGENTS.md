# Project Notes

## Project Overview

Pauper metagame data pipeline. Three stages, all plain Node with no build step:

```
mtgtop8.com  --fetch-decks.js-->  data/*.jsonl  --build-site.js-->  site/index.html
                                  --peek.js---->  terminal views
```

`scripts/` is the working code. `MTG-API/` is a read-only submodule (Express + Mongo scraper over the same site) that this pipeline does **not** use — see the MTG-API sections at the end for why.

## Setup Commands

No `package.json` at the root and no dependencies to install: `scripts/fetch-decks.js` requires puppeteer out of the submodule (`../MTG-API/backend/node_modules/puppeteer`).

Every scraper run needs the system browser, or puppeteer v19 throws looking for its unbundled revision:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/fetch-decks.js
```

## Commands

```bash
# scrape the default view (meta=299, "Last 2 Weeks") -> data/pauper-last2Weeks.jsonl
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/fetch-decks.js

# links only, writes nothing, ~35s: prints per-archetype counts and a total
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/fetch-decks.js --dry

PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium node scripts/fetch-decks.js --view last2Months
node scripts/peek.js archetypes | cards [--arch X] | deck <n|name> | events | raw <n>
node scripts/build-site.js            # data/pauper-last2Weeks.jsonl -> site/index.html
```

A full `last2Weeks` pull is 641 lists in ~7 min; `last2Months` (2,967) is ~32 min. Single-threaded by design — mtgtop8 is a small site.

## Data Files

`data/pauper-<view>.jsonl`, one decklist per line: `view`, `archetype`, `deckUrl`, `deckName`, `player`, `event`, `eventId`, `placing`, `cards[]{count,name,section,typeGroup}`, `mainboardCount`, `sideboardCount`, `uniqueCards`. Written incrementally, so an interrupted run keeps its work.

### Deck size anomalies are real, not parser bugs

29 of 641 lists are not 60/15. All 29 were checked against the site's own `O14` group headings ("19 LANDS", "15 CREATURES", "27 INSTANTS and SORC.") and **every one agrees** — zero disagreements:

- **27 lists at 61/15** — genuine 61-card main decks. Legal, and spread across 16 of the 39 archetypes (1–3 each: Burn 3, Golgari/Jund Garden 3, then Affinity, Elves, Urzatron, Dimir Control, Mono Blue Terror, Other-Control, Turbo Fog at 2) — so it is individual players opting into a 61st card, not an archetype-specific pattern.
- **1 list at 60/0, 1 at 75/0** — those pages carry **no `SIDEBOARD` heading at all**; the poster submitted no sideboard. The 75-card one is a single lumped list as entered.

Do not "fix" these in the scraper. `section` comes from the `md`/`sb` id prefixes and matches the source exactly. If you see a new size class, compare against the `O14` totals before assuming a scrape defect.

## Verification

There is no test suite. Use these checks instead — each has caught a real defect:

1. **Total vs the site.** `--dry` total must equal the "NNN decks" figure printed on the view's format page. 641 matched for `last2Weeks`.
2. **Per archetype vs metagame share.** Multiply each archetype's percentage by that total; small archetypes should match within ±3 and **nothing should sit at exactly 20** — a pile at 20 means pagination died.
3. **Deck sizes vs `O14` group headings**, for any list that is not 60/15.

Check 2 is what exposed a run that silently returned 377 of 641 lists and reported no error.

## Deployment

`site/index.html` is a single self-contained file — no CDN, no build step, opens over `file://`. Commit it; `scripts/build-site.js` regenerates it from the JSONL.

**GitHub Pages is not enabled on this repo.** As of 2026-09-15 every `*.github.io` path 404s while `raw.githubusercontent.com` serves the same file, so the committed site is not reachable as a website. To publish: repo Settings → Pages → Source *Deploy from a branch* → branch `main`, folder `/site`. Then it serves at `https://dolarjoe.github.io/mtg-competititve-performance/`.

Note the repo slug (`mtg-competititve-performance`, sic) differs from this directory name (`competitive_ranking_mtg`). Do not infer the Pages URL from the folder.

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

`last2Months` maps to `format?f=PAU`. **That upstream label is wrong.** `format?f=PAU` is meta=299, which mtgtop8 itself labels *"Last 2 Weeks"*. The real Last 2 Months view is meta=145. Verified view ids, with the "NNN decks" total each page states (measured 2026-09-15):

| meta | site label | decks | `scripts/fetch-decks.js` key |
| --- | --- | --- | --- |
| 348 | Last 5 Days | 153 | `last5Days` |
| 299 | Last 2 Weeks | 641 | `last2Weeks` (default) |
| 145 | Last 2 Months | 2,967 | `last2Months` |
| 325 | Last Major Events (2 Months) | 89 | `lastMajorEvents` |
| 127 | Last 4 Months | 7,210 | `last4Months` |
| 185 | Live Tournaments Last 3 Months | 2,729 | `liveTournaments` |
| 342 / 311 / 282 | All 2026 / 2025 / 2024 | 16,706 / 18,742 / 14,370 | `all2026Decks` / `all2025Decks` / `all2024Decks` |
| 251 / 239 / 224 | All 2023 / 2022 / 2021 | 8,889 / 4,580 / 4,303 | `all20XXDecks` |
| 223 / 186 / 170 / 169 / 168 | All 2020 → 2016 | 1,548 / 1,516 / 1,263 / 2,352 / 2,015 | `all20XXDecks` |
| 110 | All Pauper decks | 76,348 | `allPauperDecks` |

The eleven yearly views sum to 76,284 against `allPauperDecks`' 76,348 — a 0.08% gap, so the yearly views partition the whole set. 2016 is the oldest view that exists; there is no pre-2016 Pauper view.

**`allPauperDecks` is not a time machine.** Its per-archetype lists are the same 20 most-recent decklists as the 2-week view — the all-time view widens archetype coverage (52 vs 39 archetypes) without reaching into the past. Historical depth comes only from the yearly views.

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

`scripts/fetch-decks.js` replaces the submodule scraper for Pauper. `POST /pauper/:id` keeps only **39 of 641** available decklists because `Decks/pauper.js` collapses each archetype with `decksUrl[index][0]`. It also exposes no player, event or placing.

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  node scripts/fetch-decks.js                       # -> data/pauper-last2Weeks.jsonl
```

Verified run: **641 decklists across 39 archetypes in 410s** — matching the 641 total mtgtop8 states for that view — 15,486 card lines, 0 fetch errors, 641 distinct `deckUrl`. Mainboard 60 for 613 lists, 61 for 27, one outlier at 75/0; sideboard 15 except 2 lists. `player`/`event`/`eventId`/`placing` populated on all 641. Writes JSONL incrementally, so an interrupted run keeps partial output.

Importing this file is inert — `main()` is behind a `require.main === module` guard. Before that guard, a stray `require()` truncated a committed dataset to zero bytes because `main()` opened the output file before doing anything else. Keep that guard.

Flags: `--view` (any `urlMap` key), `--out`, `--max-per-arch`, `--max-pages`, `--only`, `--limit-archetypes`, `--delay`, `--dry`.

### mtgtop8 markup facts (verified from live HTML)

These selectors are load-bearing and are *not* what the upstream scraper guesses at:

- Card rows are `.deck_line`. Their **`id` prefix encodes the section**: `md*` = main deck, `sb*` = sideboard. Use this, not heading text — there is no `.deck_title_line` element on current pages, which is why heading-based splitting silently puts all 75 cards in the mainboard.
- `.O14` divs are type group headings ("19 LANDS", "15 CREATURES", "26 INSTANTS and SORC.", "SIDEBOARD") and precede their cards in DOM order.
- `a.player_big` is the deck's own player. Plain `a.player` links are the *other* decks in the same event, so a naive `querySelector` grabs the wrong player.
- `.event_title` appears twice: first the tournament name, later `#<place> <deck variant> - `.
- `document.title` is `"<Variant> - <Player> @ mtgtop8.com"`.
- **Archetype pagination is a POST, not a link.** The nav bar renders `<div class=Nav_norm onclick=PageSubmit_arch(n)>2</div>` with no `href`; the function sets a hidden `current_page` field and submits `form[name=nav_form]` (POST, action = the archetype URL). Every GET form is ignored — `&page=2` and `&cp=2` both silently re-serve page 1. Walk pages with:

  ```js
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate((n) => PageSubmit_arch(n), p),
  ]);
  ```

  Pages hold 20 decklists, so any archetype with >20 needs this. Getting it wrong is invisible: the duplicate links are filtered against `seen`, `fresh.length` is 0, and the loop breaks with a plausible-looking result. That is how a run produced 377 of 641 lists and reported no error.
- `cp=N` *does* paginate the **format** page (it lists more archetypes), which is what made `cp=` look like the answer for archetype pages too. It is not.

Related scripts: `scripts/probe-depth.js` (available lists per archetype), `scripts/scrape-pauper.js` (submodule scraper, no server/DB).

## Environment Gotchas

- Docker socket is not user-accessible on this machine (`dj` is not in group `docker`, and `sudo` requires a password). Mongo must be started with `sudo docker ...` by the operator.
- `npm ci` rewrites the committed `backend/node_modules`, dirtying the submodule working tree (~178 entries). Expected, not corruption.
