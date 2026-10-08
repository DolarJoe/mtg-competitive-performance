# POST /cards/collection

Batch lookup for up to 75 cards by various identifiers. Returns a List object with the found cards.

## Endpoint

```
POST https://api.scryfall.com/cards/collection
```

## Rate Limit

**2 requests per second** (500ms minimum between requests).

## Supported Formats

- `json` only

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `identifiers` | Array | Yes | Array of card identifier objects (max 75) |
| `pretty` | Boolean | Optional | Prettify JSON output; avoid for production |

## Card Identifiers

Each identifier must be a JSON object with one or more of these keys. Valid combinations:

| Schema | Fields | Description |
|--------|--------|-------------|
| `id` | `id` (UUID) | Find card by Scryfall ID |
| `mtgo_id` | `mtgo_id` (Integer) | Find by MTGO ID or MTGO foil ID |
| `multiverse_id` | `multiverse_id` (Integer) | Find by multiverse ID |
| `oracle_id` | `oracle_id` (UUID) | Find newest edition by Oracle ID |
| `illustration_id` | `illustration_id` (UUID) | Find preferred scans by illustration ID |
| `name` | `name` (String) | Find newest edition by card name |
| `name,set` | `name`, `set` (Strings) | Find by name and set code |
| `collector_number,set` | `collector_number`, `set` (Strings) | Find by collector number and set |

Multiple schemas can be mixed in a single request. Each identifier returns up to one card.

## Example Request

```json
POST https://api.scryfall.com/cards/collection
{
  "identifiers": [
    { "id": "683a5707-cddb-494d-9b41-51b4584ded69" },
    { "name": "Ancient Tomb" },
    { "set": "mrd", "collector_number": "150" }
  ]
}
```

## Response

```json
{
  "object": "list",
  "not_found": [],
  "data": [
    { "object": "card", "name": "...", ... }
  ]
}
```

- `data`: Found Card objects (in requested order)
- `not_found`: Array of identifiers that didn't match any card
- Order of `data` matches request order
- Unmatched identifiers throw off positional mapping; don't rely on index alone

## Important Notes

- **Maximum 75 identifiers** per request
- Content-Type must be `application/json`
- Returns newest edition for `name` and `oracle_id` lookups
- Collector numbers are strings (can contain letters/★)
- Cards not found are in `not_found` array, not errors

## Use Cases

- Batch enrichment of deck lists
- Building card databases from external data
- Looking up cards from multiple identifier systems at once