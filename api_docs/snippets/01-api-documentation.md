# Scryfall API Documentation

The Scryfall API (`api.scryfall.com`) exposes data about Magic: The Gathering cards through a REST-style interface. All responses are JSON unless otherwise noted.

## Rate Limits

The API enforces hard rate limits of **2 requests per second** (500ms between requests). This applies to all endpoints.

If you exceed the limit, the API returns a `429 Too Many Requests` response. The response headers include `Retry-After` indicating how long to wait.

## Supported Formats

Most endpoints support both `json` and `csv` response formats, selected via the `format` query parameter. JSON is the default.

## Pagination

List endpoints return paginated results. Each page holds up to **175 items**. The response includes:

- `has_more`: whether additional pages exist
- `next_page`: URL to fetch the next page of results

## Content Warnings

Some cards contain content warnings (the `content_warning` boolean field). These should be respected downstream — typically around mature imagery or language.

## Identifiers Across the API

Every object type uses UUIDs as primary identifiers. Cross-referencing uses other identifier systems:

- `oracle_id`: stable identity across reprints of the same card
- `multiverse_id`: Gatherer's identifier
- `mtgo_id`: Magic Online's identifier
- `tcgplayer_id`: TCGplayer's product identifier
- `illustration_id`: stable identity across different card artworks for the same card
- `card_back_id`: identifies the card back design

## Error Handling

The API returns standard HTTP status codes. Errors are returned as JSON objects with a description of what went wrong.

## Related Endpoints

- `GET /cards/:id` — single card lookup
- `GET /cards/search` — fulltext search
- `GET /cards/named` — lookup by exact name
- `POST /cards/collection` — batch lookup
- `GET /bulk-data` — bulk download listing
- `GET /catalogs` — catalog listing
