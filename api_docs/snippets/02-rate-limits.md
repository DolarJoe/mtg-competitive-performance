# Scryfall API Rate Limits

The Scryfall API enforces strict rate limits to protect against abuse and ensure fair usage.

## Primary Rate Limits

- **Standard endpoints**: 2 requests per second (minimum 500ms between requests)
- **Collection endpoint** (`POST /cards/collection`): 2 requests per second (500ms)
- **Bulk operations**: 1 request per 2 seconds

## Rate Limit Enforcement

- Limits are applied per-IP address
- Responses include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers when available
- A `429 Too Many Requests` response is returned when the limit is exceeded
- The `Retry-After` header indicates how many seconds to wait before retrying

## Best Practices

1. **Add delays between requests**: Always pause at least 500ms between API calls
2. **Batch requests when possible**: The collection endpoint accepts up to 75 card references per request
3. **Use bulk data for large projects**: Download oracle cards once and work locally rather than calling the API repeatedly
4. **Cache results**: Many fields (especially prices) become stale after 24 hours

## Handling 429 Responses

When you receive a 429:

1. Read the `Retry-After` header value
2. Wait that many seconds before retrying
3. Reduce your request rate
4. Consider using the bulk data exports for large datasets

## Special Cases

- The `GET /cards/search` endpoint follows the 2/second limit but may automatically retry with `include:extras` on the website (the API does not)
- Search queries that trigger UI suggestions on the website do not have those suggestions in the API