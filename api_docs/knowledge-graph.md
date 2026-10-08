# Scryfall docs — knowledge graph (triples)

Built from `api_docs/snippets/01.txt` through `10.txt`. Only the relevant snippet file needs reading.

```
Scryfall API -> hasRateLimit -> 2/second
Card -> hasProperty -> Layout
Layout -> categorizes -> card parts / faces / regions
Card -> hasEndPoint -> GET /cards/search
GET /cards/search -> rateLimit -> 2/second (500ms)
List Object -> represents -> sequence of Cards / Sets / etc
List Object -> mayBe -> paginated
List Object -> includes -> pagination info / issues
Card Object -> represents -> MTG card
Card Object -> exception -> minor (not all obtainable)
Catalog Object -> contains -> array of datapoints (words, values)
Catalog Object -> aids -> building Magic software
Bulk Data -> provides -> daily card exports
Bulk Data -> endpoint -> GET /bulk-data/:id
GET /bulk-data/:id -> format -> json / file
POST /cards/collection -> rateLimit -> 2/second (500ms)
```

Relations grow as new snippets arrive; update `api_docs/index.md` when posting.
