# Card Objects

Card objects represent individual Magic: The Gathering cards that players could obtain and add to their collection (with a few minor exceptions). Cards are the API's most complex object.

**Please also read the documentation on Layouts and Faces for details on multi-face card behavior.**

## Core Card Fields

Core properties present on every card object.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `arena_id` | Integer | Yes | This card's Arena ID; absent for cards not on Arena |
| `id` | UUID | | Unique ID for this card in Scryfall's database |
| `lang` | String | | Language code for this printing |
| `mtgo_id` | Integer | Yes | Magic Online ID (Catalog ID); absent for cards not on MTGO |
| `mtgo_foil_id` | Integer | Yes | Foil Magic Online ID; absent for cards not on MTGO |
| `multiverse_ids` | Array | Yes | Gatherer multiverse IDs as integers; includes promos, tokens, and esoteric objects |
| `resource_id` | String | Yes | Gatherer Resource ID; absent if not on Gatherer |
| `tcgplayer_id` | Integer | Yes | TCGplayer API productId |
| `tcgplayer_etched_id` | Integer | Yes | TCGplayer API etched product ID if separate product |
| `cardmarket_id` | Integer | Yes | Cardmarket API idProduct |
| `object` | String | | Content type for this object, always `card` |
| `layout` | String | | Code for this card's layout (see Layouts and Faces) |
| `oracle_id` | UUID | | Unique ID for oracle identity; consistent across reprints; absent on `reversible_card` layout |
| `prints_search_uri` | URI | | Link to begin paginating all re/prints for this card |
| `rulings_uri` | URI | | Link to this card's rulings list on Scryfall |
| `scryfall_uri` | URI | | Link to this card's permapage on Scryfall website |
| `uri` | URI | | Link to this card object on Scryfall API |

## Gameplay Fields

Properties relevant to game rules.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `all_parts` | Array | Yes | Related Card Objects; used when card is closely related to others (tokens, meld, etc.) |
| `card_faces` | Array | Yes | Card Face objects for multifaced cards |
| `cmc` | Decimal | | Mana value; some funny cards have fractional mana costs |
| `color_identity` | Colors | | Color identity |
| `color_indicator` | Colors | Yes | Colors in color indicator; null if none |
| `colors` | Colors | Yes | Card colors; null if overall card lacks colors (multi-face: colors on card_faces) |
| `defense` | String | Yes | Defense value; absent if none |
| `edhrec_rank` | Integer | Yes | EDHREC popularity rank |
| `game_changer` | Boolean | Yes | True if on Commander Game Changer list |
| `hand_modifier` | String | Yes | Vanguard hand modifier (delta such as -1) |
| `keywords` | Array | | Keyword abilities such as `Flying`, `Cumulative upkeep` |
| `legalities` | Object | | Legality across play formats |
| `life_modifier` | String | Yes | Vanguard life modifier (delta such as +2) |
| `loyalty` | String | Yes | Loyalty; some cards have non-numeric loyalty such as X |
| `mana_cost` | String | Yes | Mana cost; empty string `""` if absent; per rules missing and `{0}` differ; multi-face reports in card_faces |
| `name` | String | | Card name; multi-face cards use `name // name` |
| `oracle_text` | String | Yes | Oracle text; absent if none |
| `penny_rank` | Integer | Yes | Penny Dreadful popularity rank |
| `power` | String | Yes | Power; non-numeric such as `*` possible |
| `produced_mana` | Colors | Yes | Mana colors this card could produce |
| `reserved` | Boolean | | True if on Reserved List |
| `toughness` | String | Yes | Toughness; non-numeric such as `*` possible |
| `type_line` | String | | Card type line |

## Print Fields

Properties unique to a particular reprint.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `artist` | String | Yes | Illustrator name; absent for newly spoiled cards |
| `artist_ids` | Array | Yes | Artist IDs; absent for newly spoiled cards |
| `attraction_lights` | Array | Yes | Unfinity attraction lights |
| `booster` | Boolean | | Whether card is found in boosters |
| `border_color` | String | | Border color: `black`, `white`, `borderless`, `yellow`, `silver`, or `gold` |
| `card_back_id` | UUID | | Scryfall ID for the card back design |
| `collector_number` | String | | Collector number; may contain letters or ★ |
| `content_warning` | Boolean | Yes | True if avoid downstream use |
| `digital` | Boolean | | True if only released in video game |
| `finishes` | Array | | Computer-readable flags for `nonfoil`, `foil`, `etched` |
| `flavor_name` | String | Yes | Fun name printed on card (e.g., Godzilla series) |
| `flavor_text` | String | Yes | Flavor text |
| `frame_effects` | Array | Yes | Frame effects such as `legendary` |
| `frame` | String | | Frame layout |
| `full_art` | Boolean | | True if artwork is larger than normal |
| `games` | Array | | Games available: `paper`, `arena`, `mtgo`, `astral`, `sega` |
| `highres_image` | Boolean | | True if imagery is high resolution |
| `illustration_id` | UUID | Yes | Artwork ID; absent for newly spoiled cards |
| `image_status` | String | | Image state: `missing`, `placeholder`, `lowres`, `highres_scan` |
| `image_uris` | Object | Yes | Available image sizes for this card |
| `oversized` | Boolean | | True if oversized |
| `prices` | Object | | Daily price info: `usd`, `usd_foil`, `usd_etched`, `eur`, `eur_foil`, `eur_etched`, `tix` |
| `printed_name` | String | Yes | Localized printed name |
| `printed_text` | String | Yes | Localized printed text |
| `printed_type_line` | String | Yes | Localized printed type line |
| `promo` | Boolean | | True if promotional print |
| `promo_types` | Array | Yes | Promo categories |
| `purchase_uris` | Object | Yes | Marketplace listing URIs; absent if unpurchaseable |
| `rarity` | String | | Rarity: `common`, `uncommon`, `rare`, `special`, ` mythic`, or `bonus` |
| `related_uris` | Object | | URIs to other MTG online resources |
| `released_at` | Date | | First release date |
| `reprint` | Boolean | | True if a reprint |
| `scryfall_set_uri` | URI | | Link to card's set on Scryfall website |
| `set_name` | String | | Full set name |
| `set_search_uri` | URI | | Link to paginate this card's set |
| `set_type` | String | | Set type |
| `set_uri` | URI | | Link to card's set object on Scryfall API |
| `set` | String | | Set code |
| `set_id` | UUID | | Set object UUID |
| `story_spotlight` | Boolean | | True if Story Spotlight |
| `textless` | Boolean | | True if printed without text |
| `variation` | Boolean | | True if a variation of another printing |
| `variation_of` | UUID | Yes | Printing ID of the card this varies from |
| `security_stamp` | String | Yes | Security stamp: `oval`, `triangle`, `acorn`, `circle`, `arena`, or `heart` |
| `watermark` | String | Yes | Watermark |
| `preview.previewed_at` | Date | Yes | Preview date |
| `preview.source_uri` | URI | Yes | Preview source link |
| `preview.source` | String | Yes | Preview source name |

## Related Card Objects

Cards closely related to others (calling them by name, generating tokens, melding) have `all_parts` containing Related Card objects.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique ID in Scryfall's database |
| `object` | String | Content type, always `related_card` |
| `component` | String | Role: `token`, `meld_part`, `meld_result`, or `combo_piece` |
| `name` | String | Related card name |
| `type_line` | String | Related card type line |
| `uri` | URI | URI to retrieve full object on Scryfall API |

## Card Face Objects

Multiface cards have `card_faces` with Card Face objects. Each face has these fields:

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `artist` | String | Yes | Illustrator name |
| `artist_id` | UUID | Yes | Illustrator ID |
| `cmc` | Decimal | Yes | Mana value (only reversible layouts) |
| `color_indicator` | Colors | Yes | Face color indicator |
| `colors` | Colors | Yes | Face colors |
| `defense` | String | Yes | Defense value |
| `flavor_text` | String | Yes | Flavor text on this face |
| `illustration_id` | UUID | Yes | Artwork ID |
| `image_uris` | Object | Yes | Face imagery (double-sided cards only) |
| `layout` | String | Yes | Face layout (reversible cards only) |
| `loyalty` | String | Yes | Face loyalty |
| `mana_cost` | String | | Face mana cost; empty `""` if absent |
| `name` | String | | Face name |
| `object` | String | | Always `card_face` |
| `oracle_id` | UUID | Yes | Oracle ID (reversible cards only) |
| `oracle_text` | String | Yes | Oracle text for this face |
| `power` | String | Yes | Power |
| `printed_name` | String | Yes | Localized printed name |
| `printed_text` | String | Yes | Localized printed text |
| `printed_type_line` | String | Yes | Localized printed type line |
| `toughness` | String | Yes | Toughness |
| `type_line` | String | Yes | Type line for this face |
| `watermark` | String | Yes | Face watermark |

## Legalities Object

```json
{
  "standard": "legal",
  "future": "not_legal",
  "historic": "legal",
  "timeless": "legal",
  "gladiator": "legal",
  "pioneer": "legal",
  "modern": "legal",
  "legacy": "legal",
  "pauper": "not_legal",
  "vintage": "legal",
  "penny": "legal",
  "commander": "legal",
  "oathbreaker": "legal",
  "standardbrawl": "legal",
  "brawl": "legal",
  "competitivebrawl": "legal",
  "alchemy": "not_legal",
  "paupercommander": "legal",
  "duel": "legal",
  "oldschool": "not_legal",
  "premodern": "legal",
  "predh": "not_legal",
  "tlr": "legal"
}
```

Possible values: `legal`, `not_legal`, `restricted`, `banned`.