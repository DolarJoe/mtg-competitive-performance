# GET /bulk-data/:id

Retrieves a single Bulk Data object by ID.

## Parameters

| Parameter | Type | Optional | Description |
|-----------|------|----------|-------------|
| `:id` | UUID | Yes | The ID of the Bulk Data object |
| `format` | String | Optional | `json` (default) or `file` |
| `pretty` | Boolean | Optional | If true, returns prettified JSON (not recommended for production) |

## Example

Fetch "All Cards" bulk data:

```bash
GET https://api.scryfall.com/bulk-data/922288cb-4bef-45e1-bb30-0c2bd3d3534f
```

Response:

```json
{
  "object": "bulk_data",
  "id": "922288cb-4bef-45e1-bb30-0c2bd3d3534f",
  "type": "all_cards",
  "updated_at": "2026-09-16T21:18:08.763+00:00",
  "uri": "https://api.scryfall.com/bulk-data/922288cb-4bef-45e1-bb30-0c2bd3d3534f",
  "name": "All Cards",
  "description": "A JSON file containing every card object on Scryfall in every language.",
  "jsonl_download_uri": "https://data.scryfall.io/all-cards/all-cards-20260916211808.jsonl.gz",
  "compressed_size": 392979256
}
```

## Usage Notes

- Bulk data is refreshed daily (12-24 hours)
- File timestamps change daily
- Use `/cards/manifest` to check for updates to specific cards
- Bulk data includes prices (but they're stale after 24 hours)
- For large-scale analysis, download and process locally rather than hitting the API repeatedly