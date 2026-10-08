# GET /cards/search

Search for cards using Scryfall's fulltext search syntax. Returns a List object of Card objects.

## Endpoint

```
GET https://api.scryfall.com/cards/search
```

## Rate Limit

**2 requests per second** (minimum 500ms between requests).

## Supported Formats

- `json` (default)
- `csv`

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | String | Yes | Fulltext search query; properly encoded; max 1000 Unicode characters |
| `unique` | String | No | Strategy for omitting similar cards (see Unique Modes below) |
| `order` | String | No | Sort method (see Sorting below) |
| `dir` | String | No | Sort direction (see below) |
| `include_extras` | Boolean | No | Include extra cards (tokens, planes, etc.); default `false` |
| `include_multilingual` | Boolean | No | Include all languages; default `false` |
| `include_variations` | Boolean | No | Include rare variants (e.g., Hairy Runesword); default `false` |
| `page` | Integer | No | Page number (default 1) |
| `format` | String | No | `json` or `csv` (default `json`) |
| `pretty` | Boolean | No | Prettify JSON output; avoid for production |

## Unique (Rollup) Modes

The `unique` parameter controls duplicate removal:

| Value | Default | Description |
|-------|---------|-------------|
| `cards` | ✓ | Removes duplicate gameplay objects (same name, same functionality). Multiple prints of `Pacifism` → one `Pacifism`. |
| `art` | | One copy of each unique artwork. Multiple prints of `Pacifism` → one per different illustration. |
| `prints` | | All prints (disables rollup). Multiple prints of `Pacifism` → all matching prints returned. |

## Sorting Cards

| Order | Default | Description |
|-------|---------|-------------|
| `name` | ✓ | Sort by name A → Z |
| `set` | | Sort by set and collector number: AAA/#1 → ZZZ/#999 |
| `released` | | Sort by release date: Newest → Oldest |
| `rarity` | | Sort by rarity: Common → Mythic |
| `color` | | Sort by color and color identity: WUBRG → multicolor → colorless |
| `usd` | | Sort by lowest USD price: 0.01 → highest (null last) |
| `tix` | | Sort by lowest TIX price: 0.01 → highest (null last) |
| `eur` | | Sort by lowest EUR price: 0.01 → highest (null last) |
| `cmc` | | Sort by mana value: 0 → highest |
| `power` | | Sort by power: null → highest |
| `toughness` | | Sort by toughness: null → highest |
| `edhrec` | | Sort by EDHREC rank: lowest → highest |
| `penny` | | Sort by Penny Dreadful rank: lowest → highest |
| `artist` | | Sort by front-side artist name: A → Z |
| `review` | | Podcast review order (color & CMC, Booster Fun at end) |

### Sort Direction

| Dir | Default | Description |
|-----|---------|-------------|
| `auto` | ✓ | Scryfall chooses most intuitive direction |
| `asc` | | Ascending (follows arrows in order table) |
| `desc` | | Descending (reverses order table arrows) |

## Pagination

- Returns 175 cards per page
- Use `page` parameter or follow `next_page` URL
- `has_more` indicates additional pages
- `total_cards` provides full result count

## Missing Luxuries (API vs Website)

The API is stricter than the Scryfall website:

1. **No auto-retry on zero results**: Website retries with `include:extras` and `lang:any`; API does not
2. **No set redirects**: Searching `e:set` on website redirects to custom gallery; API does not redirect
3. **No UI suggestions**: Website suggests expanding search (e.g., `o:changeling`, `unique:prints`); API does not
4. **No price swizzling**: Website may show cheapest prints for price searches; API does not
5. **No spelling correction**: Website helps with typos; API does not

## Example Requests

### Red creatures with 3 power, sorted by mana value

```
GET https://api.scryfall.com/cards/search?order=cmc&q=c%3Ared+pow%3D3
```

### Find all prints of Lightning Bolt

```
GET https://api.scryfall.com/cards/search?q=!Lightning+Bolt&unique=prints
```

### Search for cards with specific artist, include multilingual

```
GET https://api.scryfall.com/cards/search?q=artist%3A%22Ryan+Pancoast%22&include_multilingual=true
```

## Response

Returns a List object with `data` array of Card objects.

```json
{
  "object": "list",
  "total_cards": 1005,
  "has_more": true,
  "next_page": "https://api.scryfall.com/cards/search?...",
  "data": [
    { "object": "card", "name": "...", ... },
    ...
  ]
}
```

## Error Responses

- `400` — Invalid query syntax
- `404` — No cards matched the query (not an error object; empty list)
- `422` — Query too long (>1000 characters) or invalid parameter
- `429` — Rate limit exceeded