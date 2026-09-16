# scryfall_api

Two things: a thin Scryfall client, and a script that bolts card images and
Scryfall links onto the decklist JSONL.

```
scryfall_api/
├── lib/scryfall.js   the library — search, name→card resolution, rate gate
├── search.js         that search function on the command line
├── enrich.js         data/*.jsonl -> data/*.enriched.jsonl with img + url
└── cache/cards.jsonl name -> {name, url, img, imgBack}, one JSON line each
```

Plain Node, zero dependencies, no `package.json`. Node 26's global `fetch` does
the HTTP.

## Two numbers

| Knobs                    | Limit | Used | Why the gap                                          |
| ------------------------ | ----- | ---- | ---------------------------------------------------- |
| Search query length      | 1000  | 980  | headroom                                             |
| Minimum gap between calls | 500ms | 600ms | headroom, plus 429 backoff                             |

The 980 is measured on the **encoded** query. Names are full of spaces and a
space costs three characters once encoded, so packing on the decoded length
could put a 960-character query on the wire at 1,100+. Encoding is the number
Scryfall's limit actually applies to. `--budget` and `--delay` override either.

## Commands

```bash
node scryfall_api/search.js "cmc=1 is:pauper"          # any Scryfall query
node scryfall_api/search.js --exact Duress "Gitaxian Probe"
node scryfall_api/search.js --json "type:instant pauper"
node scryfall_api/search.js --limit 5 "tempo countertop"

node scryfall_api/enrich.js --dry                      # pack plan, no network
node scryfall_api/enrich.js --file data/pauper-last2Weeks.jsonl
node scryfall_api/enrich.js --file data/pauper-all2016Decks.jsonl --out /tmp/x.jsonl
```

`enrich.js` adds two fields to every card line and never touches the input file:

```js
{ count: 4, name: "Duress", section: "main", typeGroup: "s",
  img: "https://cards.scryfall.io/normal/front/3/4/34c3a894-….jpg?1783908930",
  url: "https://scryfall.com/card/fdn/606/duress?utm_source=api" }
```

`imgBack` appears as well on transform and modal double-faced cards. Records
gain `unresolved: []`, and the run prints what it couldn't resolve.

Resolution runs in three passes, cheapest first: batched exact-name search, then
`GET /cards/named?exact=` per leftover, then the same with ` / ` rewritten to
` // `. Anything still missing keeps `img: null, url: null`.

## Scryfall's syntax, where it bites

Facts measured against the live API, not from the docs page (which is
client-rendered and won't `curl`).

- **There is no `exact:` keyword.** `(exact:"Duress")` → *400: Unknown keyword
  “exact”*. The exact-name operator is `!`, so terms are `!"Duress"`, joined
  with `or`: `(!"Duress" or !"Daze")`. `exact` as a list exists only on
  `POST /cards/collection`.
- **`unique=card` returns double-faced cards under both half-names.** Asking for
  `!"Delver of Secrets"` gives a card named *Delver of Secrets // Insectile
  Aberration*. Match returned cards by full name, front half, and each
  `card_faces[].name` or you silently lose every DFC.
- **Transform and modal-DFC cards have no `image_uris` on the card object.**
  Both pictures live on `card_faces[]`. Reading only `card.image_uris` yields
  `null` for Delver, which is how the first run shipped 108 imageless lines.
  Split cards are the opposite — one composite image on the parent, nothing on
  the faces.
- **`/cards/search` does not return `oraclecard_uri`.** It's `undefined` on
  search results, present on the single-card endpoints. So `url` is
  `scryfall_uri`: a specific printing's page. The canonical
  `scryfall.com/cards/oracle/<oracle_id>` has to be built from `card.oracle_id`.
- **`scryfall_uri` arrives with `?utm_source=api` on it.** Kept deliberately —
  Scryfall asks for attribution. Strip it in the front end if it offends.
- **An empty result is a 404**, not an empty 200: *"Your query didn't match any
  cards."* `searchAll()` turns that into `[]`; bad syntax stays a 400 and still
  throws.
- Pages hold up to 175 cards. A batch of 35 names can still spill onto a second
  page, which is why the 2016 run made 19 requests for 18 batches.
- Requests need a real `User-Agent` and an `Accept` header or they're refused.

## Verified runs

| Window | Names | Requests | Time | Result                            |
| ------ | ----- | -------- | ---- | --------------------------------- |
| `last2Weeks` | 864 | 42 | 31.6s | 15,486 lines annotated, 0 unresolved |
| `last2Weeks` repair | 4 | 1 | 0.3s | DFC images backfilled, 108 `imgBack` |
| `all2016Decks` | 871 (556 new) | 19 | 12.8s | 49,545 lines, 1 unresolved |

The one unresolved name is mtgtop8's literal placeholder **"Unknown Card"**
(404, and correctly so).

Cached lookups cost nothing: re-running `last2Weeks` after the 2016 run fetched
4 names and finished in 0.3s.

## Cache

`cache/cards.jsonl`, keyed by the mtgtop8 spelling, one line each:

```json
{"key":"duress","name":"Duress",
 "url":"https://scryfall.com/card/fdn/606/duress?utm_source=api",
 "img":"https://cards.scryfall.io/normal/front/3/4/34c3a894-….jpg?1783908930"}
{"key":"delver of secrets","name":"Delver of Secrets // Insectile Aberration",
 "url":"https://scryfall.com/card/inr/60/delver-of-secrets-insectile-aberration?utm_source=api",
 "img":"…/normal/front/6/9/6904ea20-….jpg?…","imgBack":"…/normal/back/6/9/6904ea20-….jpg?…"}
```

Note the second line: the cache key is the spelling mtgtop8 used, `name` is
Scryfall's canonical one.

Deliberately lean — no oracle ids, sets, or prices. A row with no `img` is
treated as stale and refetched, so a bug in the image picker heals itself on the
next run rather than being cached forever.
