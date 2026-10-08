# Catalog Objects

A Catalog object contains an array of Magic datapoints (words, card values, etc.). Catalog objects assist building other Magic software and understanding possible values for fields on Card objects.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `object` | String | Content type, always `catalog` |
| `uri` | URI | Link to current catalog on Scryfall API |
| `total_values` | Integer | Number of items in `data` array |
| `data` | Array | Array of datapoints as strings |

## Example Request

Retrieve the catalog of land types.

```
GET https://api.scryfall.com/catalog/land-types
```

Response:

```json
{
  "object": "catalog",
  "uri": "https://api.scryfall.com/catalog/land-types",
  "total_values": 18,
  "data": [
    "Cave", "Cloud", "Desert", "Forest", "Gate", "Island",
    "Lair", "Locus", "Mine", "Mountain", "Sphere",
    "Plains", "Planet", "Power-Plant", "Swamp",
    "Tower", "Town", "Urza's"
  ]
}
```

## Available Catalogs

### Card Names and Types
- `/catalog/card-names` — All Oracle card names
- `/catalog/card-types` — Card types (Creature, Instant, etc.)
- `/catalog/artifact-types` — Artifact subtypes
- `/catalog/battle-types` — Battle types
- `/catalog/creature-types` — Creature types
- `/catalog/enchantment-types` — Enchantment types
- `/catalog/land-types` — Land types
- `/catalog/planeswalker-types` — Planeswalker types
- `/catalog/spell-types` — Spell types
- `/catalog/supertypes` — Super types (Legendary, Basic, etc.)

### Card Attributes
- `/catalog/artist-names` — Illustrator names
- `/catalog/word-bank` — Word bank entries
- `/catalog/keyword-abilities` — Keyword abilities (Flying, Trample, etc.)
- `/catalog/keyword-actions` — Keyword actions
- `/catalog/ability-words` — Ability words
- `/catalog/flavor-words` — Flavor words
- `/catalog/powers` — Power values
- `/catalog/toughnesses` — Toughness values
- `/catalog/loyalties` — Loyalty values
- `/catalog/watermarks` — Watermarks

### Usage

Catalog data is useful for:

- Building dropdown filters for search UIs
- Validating user input before submitting search queries
- Understanding the full domain of possible values for card properties
- Creating reference documentation for Magic terminology

Catalogs are updated regularly but are not real-time. They reflect the current state of the Scryfall database.