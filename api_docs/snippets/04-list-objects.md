# List Objects

A List object represents a requested sequence of other objects (Cards, Sets, etc.). List objects may be paginated and include information about issues raised when generating the list.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `object` | String | Content type for this object, always `list` |
| `data` | Array | Array of requested objects, in a specific order |
| `has_more` | Boolean | True if this List is paginated and a page beyond the current page exists |
| `next_page` | URI | Full API URI to the next page; submit a GET request to continue paginating forward |
| `total_cards` | Integer | Total number of cards found across all pages (only for lists of Card objects) |
| `warnings` | Array | Human-readable warnings issued when generating the list (non-fatal input issues) |

## Pagination

- Page size is **175 items** for card search results
- `has_more` indicates whether additional pages exist
- `next_page` contains the complete URL to fetch the next page
- Follow `next_page` until `has_more` is `false`
- `total_cards` gives the full result count across all pages (only for card lists)

## Warnings

Warnings are non-fatal issues the API discovered with your input. They indicate the List may not contain all requested information. Fix warnings and resubmit the request.

## Example: Paginated Search

```
GET https://api.scryfall.com/cards/search?q=c%3Awhite+mv%3D1
```

Response shape:

```json
{
  "object": "list",
  "total_cards": 677,
  "has_more": true,
  "next_page": "https://api.scryfall.com/cards/search?...&page=2&...",
  "data": [ ... ]
}
```

## List Variants

List objects are returned by:

- `GET /cards/search` — card search results
- `GET /cards/named` — single card lookup (wrapped in a List)
- `GET /bulk-data` — bulk data file listing
- `GET /catalogs` — catalog listing
- `GET /sets` — set listing

## Important Notes

- A single card result still returns a List object, not a bare Card object
- `total_cards` is only present on card lists
- `next_page` URLs include all original query parameters
- Do not construct `next_page` URLs yourself; use the URI provided by the API
- The `data` array order matches the requested sort order
- List objects are the standard response envelope for search and collection operations