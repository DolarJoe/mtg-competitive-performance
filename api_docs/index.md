# Scryfall docs — knowledge graph

Handoff folder: `api_docs/`. Start at `api_docs/index.md`; it describes snippet files in `api_docs/snippets/`. Update the index when posting new snippets.

## Graph format: triples `subject -> relation -> object`

The knowledge graph stores structured relationships extracted from the docs. The main graph is in `api_docs/knowledge-graph.md`.

Each snippet file contributes triples in the format:
```
entity (type) -> relation -> object
```

Build/search incrementally as new snippets arrive; start from this index to avoid loading everything.

## Snippet Index and Documentation Files

The following documentation files were built from `api_docs/snippets/1.txt` through `10.txt`:

| File | Topic | Size |
|------|-------|------|
| `01-api-documentation.md` | API Documentation overview | 1.9 KB |
| `02-rate-limits.md` | Rate limits and best practices | 1.6 KB |
| `03-layouts-faces.md` | Card layouts and multi-face types | 6.1 KB |
| `04-list-objects.md` | List object structure and pagination | 2.3 KB |
| `05-card-objects.md` | Detailed card field reference | 9.7 KB |
| `06-cards-search.md` | Fulltext search syntax and parameters | 4.6 KB |
| `07-catalog-objects.md` | Catalogs for card values/types | 2.4 KB |
| `08-bulk-data.md` | Daily data exports and bulk files | 2.8 KB |
| `09-bulk-data-id.md` | Single bulk data lookup by ID | 1.3 KB |
| `10-cards-collection.md` | Batch card lookup POST endpoint | 2.5 KB |

Each file provides structured documentation on its topic. Read only the relevant file to keep the context window light. Post new snippets to `api_docs/snippets/` and update this index with a one-line description.

## Knowledge Graph

The current graph contains 14 triples across the 10 snippets. It is stored in `api_docs/knowledge-graph.md`. Relationships grow as new snippets are added. To rebuild the graph after adding snippets, read the relevant snippet file(s) and extend the graph accordingly.