# Bulk Data Files

Scryfall provides daily exports of card data in bulk files for programmatic access. These files are represented as `bulk_data` objects via the API.

## File Format

Bulk files are **gzipped JSONL** (JSON Lines) archives:

- `.jsonl.gz` extension (not `.tar.gz`)
- Stream directly without full decompression
- One JSON object per line

Many languages can stream JSONL from gzip:

```ruby
# Ruby example
Zlib::GzipReader#each_line
```

On POSIX systems: `gunzip` from shell.

## Important Notes

- **Prices**: Included in bulk data but dangerously stale after 24 hours. Use only for trends/estimates, not storefronts.
- **Gameplay data**: Card names, Oracle text, mana costs change rarely. Download once per week or after set releases.
- **Card types**: Every card type included — DFCs, planar, schemes, vanguards, tokens, funny cards.
- **Art/Oracle Tags**: Community-maintained data from Tagger project. See Tags documentation for format.
- **Update frequency**: Bulk data collected once per 12-24 hours. Use card API for fresh data.
- **Manifest**: Use `/cards/manifest` to check what changed.

## Available Bulk Data Files

| Type | File Name | Compressed Size | Contents |
|------|-----------|-----------------|----------|
| `oracle_cards` | Oracle Cards | 23.5 MB | One Scryfall card object per Oracle ID; most up-to-date recognizable version |
| `unique_artwork` | Unique Artwork | 36.1 MB | Scryfall card objects with unique artworks; best image scans |
| `default_cards` | Default Cards | 74.7 MB | Every card in English or printed language (monolingual) |
| `all_cards` | All Cards | 375 MB | Every card in every language |
| `rulings` | Rulings | 5.12 MB | All rulings; reference cards via `oracle_id` |
| `art_tags` | Art Tags | 12.2 MB | Art (illustration) tags from Tagger community |
| `oracle_tags` | Oracle Tags | 5.71 MB | Oracle tags from Tagger community |

## Bulk Data Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique ID for this bulk item |
| `uri` | URI | Scryfall API URI |
| `type` | String | Computer-readable file type |
| `name` | String | Human-readable name |
| `description` | String | Human-readable description |
| `updated_at` | Timestamp | Last update time |
| `jsonl_download_uri` | URI | Download URL for `.jsonl.gz` |
| `compressed_size` | Integer | Compressed size in bytes |

## Example: List Bulk Data

```
GET https://api.scryfall.com/bulk-data
```

## When to Use Bulk Data vs API

- **Bulk**: Large historical analysis, one-time downloads, price trends
- **API**: Real-time lookups, fresh card data, small result sets

## Access Patterns

1. Download `.jsonl.gz` directly from `jsonl_download_uri`
2. Stream and parse line by line (do not load entire file into memory)
3. Decompress on-the-fly if supported by your tooling