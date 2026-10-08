# Card Layouts and Faces

The `layout` property categorizes the arrangement of card parts, faces, and other bounded regions on cards. Use it to programmatically determine which other properties on a card you can expect.

## Layout Types

| Layout | Description |
|--------|-------------|
| `normal` | A standard Magic card with one face |
| `split` | A split-faced card (two faces, caster chooses which to cast) |
| `flip` | Cards that invert vertically with the flip keyword |
| `transform` | Double-sided cards that transform |
| `modal_dfc` | Double-sided cards that can be played either side |
| `meld` | Cards with meld parts printed on the back |
| `leveler` | Cards with Level Up |
| `class` | Class-type enchantment cards |
| `case` | Case-type enchantment cards |
| `saga` | Saga-type cards |
| `adventure` | Cards with an Adventure spell part |
| `prepare` | Cards with a prepared spell part |
| `mutate` | Cards with Mutate |
| `prototype` | Cards with Prototype |
| `battle` | Battle-type cards |
| `planar` | Plane and Phenomenon-type cards |
| `scheme` | Scheme-type cards |
| `vanguard` | Vanguard-type cards |
| `token` | Token cards |
| `double_faced_token` | Tokens with another token printed on the back |
| `emblem` | Emblem cards |
| `augment` | Cards with Augment |
| `host` | Host-type cards |
| `art_series` | Art Series collectable double-faced cards |
| `reversible_card` | A Magic card with two sides that are unrelated |
| `front_card` | An extra card that indicates a deck type |

## Key Rules by Layout

| Layout | Has `card_faces` | Has `all_parts` |
|--------|------------------|-----------------|
| `split` | ✓ | |
| `flip` | ✓ | |
| `transform` | ✓ | |
| `modal_dfc` | ✓ | |
| `meld` | | ✓ |
| `double_faced_token` | ✓ | |

## Card Faces

Magic cards can include multiple faces on a single piece of card stock. Scryfall includes information about each face using the `card_faces` property.

### Split Cards
- Sorceries or instants with two faces
- Caster chooses which face to cast
- Back is the normal Magic card back
- Example: `Wear // Tear`

### Flip Cards
- Invert vertically using the flip keyword
- Two faces on the same card front
- Example: `Budoka Gardener // Dokai, Weaver of Life`

### Transform Cards (Double-Faced Cards)
- Double-sided cards that transform
- Each side has distinct characteristics
- Example: `Delver of Secrets // Insectile Aberration`

### Modal DFCs (Modal Double-Faced Cards)
- Can be played either side
- Both sides have mana costs
- Example: `Valakut Awakening // Valakut Stoneforge`

### Meld Cards
- Two cards that combine into one oversized card
- Uses `all_parts` to reference the meld result
- Example: `Gisela, the Broken Blade // Bruna, the Fading Light`

### Leveler Cards
- Cards with Level Up mechanic
- Three tiers of abilities based on level counters
- Example: `Kargan Dragonlord`

### Class Cards
- Enchantments with three class levels
- Each level unlocks new abilities
- Example: `Fighter Class`

### Saga Cards
- Enchantments with chapter abilities
- One chapter triggers each turn
- Example: `History of Benalia`

### Adventure Cards
- Creatures with an instant/sorcery spell attached
- Cast the adventure from exile
- Example: `Brazen Borrower // Petty Theft`

### Prototype Cards
- Two different mana costs for different power levels
- Example: `The Stone Brain`

### Battle Cards
- New card type introduced in 2023
- Have defense instead of toughness
- Example: `Invasion of Ikoria`

### Planar/Scheme/Vanguard Cards
- Used in Planechase, Archenemy, and Vanguard formats
- Have special layouts for their respective formats

### Token Cards
- Represent token creatures/permanents
- Some are double-faced (`double_faced_token`)
- Not included in standard card searches by default

### Augment/Host Cards
- Unstable set mechanic
- Augment cards attach to Host creatures
- Silver-bordered / acorn-stamped

### Reversible Cards
- Two unrelated cards on one card stock
- Each side is a complete card
- Example: `Bedeck // Bedazzle`

### Art Series Cards
- Collectable double-faced cards
- One side has art, the other has art
- Example: `Praetors` art series

## Card Face Properties

Each face in `card_faces` has:

| Property | Type | Description |
|----------|------|-------------|
| `artist` | String | Illustrator name |
| `artist_id` | UUID | Illustrator ID |
| `cmc` | Decimal | Mana value of this face |
| `color_indicator` | Colors | Color indicator if any |
| `colors` | Colors | Colors for this face |
| `defense` | String | Defense value (Battle cards) |
| `flavor_text` | String | Flavor text on this face |
| `illustration_id` | UUID | Artwork ID |
| `image_uris` | Object | URIs for this face's imagery |
| `layout` | String | Layout of this face |
| `loyalty` | String | Loyalty value |
| `mana_cost` | String | Mana cost for this face |
| `name` | String | Name of this face |
| `object` | String | Always "card_face" |
| `oracle_id` | UUID | Oracle ID for this face |
| `oracle_text` | String | Oracle text for this face |
| `power` | String | Power value |
| `printed_name` | String | Localized printed name |
| `printed_text` | String | Localized printed text |
| `printed_type_line` | String | Localized printed type line |
| `toughness` | String | Toughness value |
| `type_line` | String | Type line for this face |
| `watermark` | String | Watermark on this face |

## Image Handling by Layout

- **Normal, Leveler, Class, Case, Saga, Adventure, Prototype, Battle, Planar, Scheme, Vanguard, Token, Emblem, Augment, Host, Front Card**: `image_uris` on the parent card object
- **Split, Flip, Transform, Modal DFC, Double-faced Token, Reversible Card, Art Series**: `image_uris` on each `card_face` object
- **Meld**: `image_uris` on parent for the front, separate meld result has its own images

## Oracle ID Behavior

- Single-faced cards: `oracle_id` on the card object
- Multi-faced cards with related faces (transform, modal_dfc, flip, split): shared `oracle_id` on parent
- Reversible cards: `oracle_id` on each `card_face` (absent on parent)
- Meld cards: `oracle_id` on each component and the meld result