# Modding Hero of Arcadia

A mod is a single JSON file. It can add new units, factions, terrain, buildings, biomes
for random maps and hand-made maps. It can also change any existing entry or game rule,
remove entries, and bring its own pixel-art sprites. No code is involved: the game's own
content is built the same way, from the JSON files in `src/data/`.

The game comes with three example mods, all off by default. Turn them on under
**Main menu → Mods**:

| Mod | Shows how to |
| --- | --- |
| [Frost Giants](public/mods/frost-giants.json) | add a faction with perks, a unit and its sprite |
| [Marshlands](public/mods/marshlands.json) | add terrain with a sprite, a biome for random maps and a map |
| [Iron Rules](public/mods/iron-rules.json) | patch existing units and buildings, change rules, remove a map |

## Installing a mod

- **Players:** Main menu → **Mods** → **Import mod file**, then pick the `.json` file. The
  mod is stored in the browser (or the desktop app) and turned on. Select a mod to turn it
  on or off, change its load order or remove it. Changes take effect when you leave the screen.
- **Shipping mods with the game:** put the file in `public/mods/` and add its file name to
  `public/mods/index.json`. Bundled mods show up in the list for every player (off until
  they turn them on). This works for a self-hosted web build too: no rebuild needed, just
  add the files next to the game.

## A first mod

```json
{
  "format": "hero-of-arcadia-mod",
  "id": "stone-golems",
  "name": "Stone Golems",
  "version": "1.0.0",
  "author": "You",
  "description": "The Cobalt League can raise slow, tough stone golems.",
  "content": {
    "units": [
      {
        "id": "golem", "name": "Golem", "cost": 350, "tags": ["infantry", "armored"],
        "maxHp": 10, "attack": 6, "defense": 5, "move": 2, "moveType": "foot",
        "range": [1, 1], "vision": 1, "moveAndFire": true, "counter": true, "canCapture": false,
        "bonusVs": {}, "sprite": "shieldbearer", "blurb": "Stone given purpose."
      }
    ],
    "factions": [
      { "id": "cobalt", "roster": { "add": ["golem"] } }
    ]
  }
}
```

The golem borrows the shieldbearer's sprite (`"sprite": "shieldbearer"`). The second entry
**patches** the existing Cobalt League: only `roster` changes, and its name, colours and
perks stay as they were.

## The mod file

| Field | Required | What it is |
| --- | :---: | --- |
| `format` | yes | Always `"hero-of-arcadia-mod"`. |
| `id` | yes | Unique id: lower-case letters, digits and dashes (`"frost-giants"`). |
| `name` | yes | Shown in the Mods screen and in saves. |
| `version` | yes | Any text, e.g. `"1.0.0"`. |
| `author`, `description` | | Shown in the Mods screen. |
| `requires` | | Ids of mods that must be on and loaded before this one. |
| `content` | | New and changed entries: `units`, `factions`, `terrain`, `buildings`, `moveTypes`, `biomes`, `maps` (each a list), and `rules` (an object). |
| `remove` | | Ids to delete, e.g. `{ "maps": ["greenvale"], "units": ["scout"] }`. |
| `sprites` | | Pixel sprites, keyed `"units/<id>"`, `"buildings/<id>"` or `"terrain/<id>"`. |

### How mods combine

Content is built in layers: the base game first, then each mod that is on, in the order
shown in the Mods screen.

- An entry whose `id` is **new** is added. It must be complete (all required fields).
- An entry whose `id` **already exists** is merged into it. Objects merge field by field;
  lists and plain values replace. `{ "id": "catapult", "cost": 500 }` changes only the
  cost. `{ "id": "pikeman", "bonusVs": { "rider": 2 } }` changes the bonus against riders
  and keeps the others. `{ "id": "rider", "range": [1, 2] }` replaces the whole range.
- `rules` merges the same way.
- `remove` runs after the mod's own content. Removing a unit also takes it out of
  barracks lists, damage bonuses and faction rosters. A map that still places a removed
  unit is left out, with a notice in the Mods screen.
- When two mods change the same thing, the one loaded **later** wins.

After every mod the whole content is checked. If a mod leaves anything invalid (a missing
field, a reference to an unknown unit, a sprite that is the wrong size...), **that mod is
not loaded** and the Mods screen shows it as `ERROR` with the exact problems, e.g.
`units.golem.cost: must be at least 1`. The other mods still load. The game also refuses
a set of mods that leaves no map and no biome to play on.

## Content reference

Everything below is also how the base game is written. The files in `src/data/` are good
examples to copy from.

### Units

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `name` | text | |
| `cost` | number | Gold to raise at a barracks (at least 1). |
| `maxHp` | whole number | Units in the base game have 10. |
| `attack`, `defense` | number | Damage = attack × bonus × (hp ÷ maxHp) × (1 − 10% per defense point). |
| `move` | whole number | Movement points per turn. |
| `moveType` | id | `foot`, `mounted`, `wheeled` or a mod's own move type. |
| `range` | `[min, max]` | Attack distance in tiles (`[1, 1]` is melee). |
| `vision` | whole number | Sight range with fog of war on. |
| `moveAndFire` | true/false | `false` means the unit either moves or attacks in a turn (catapults). |
| `counter` | true/false | Whether it strikes back when attacked within its range. |
| `canCapture` | true/false | Whether it can capture buildings. |
| `bonusVs` | object | Damage multipliers against unit ids, e.g. `{ "rider": 1.5 }`. |
| `tags` | list | Labels that faction perks target. The base game uses `infantry`, `ranged`, `cavalry`, `siege`, `magic`, `light` and `armored`. |
| `sprite` | id | Optional: draw this unit with another unit's sprite. |
| `blurb` | text | One or two sentences for the build menu and How to Play. |

A new unit is only raised where something lists it: a building's `produces`, or a
faction's `roster`.

### Factions

| Field | Notes |
| --- | --- |
| `id`, `name`, `short` | `short` is used in tight spots ("Frost"). |
| `ramp` | Team colours as three [palette](#palette) indices: `[light, mid, dark]`. Choose colours no other faction uses. |
| `blurb` | One line of flavour. |
| `perks` | List of `{ "name", "desc", "effects": [...] }`. `desc` is optional and is generated from the effects when left out. |
| `roster` | `replace` swaps a standard unit everywhere, including starting armies (`{ "archer": "ranger" }`). `add` lists extra units every production building can raise. `remove` lists units the faction can never raise. |

**Effects.** Most effects take a unit filter: `units` (a list of ids) and/or `tags`. With
neither, the effect applies to every unit. `add` adds to a value and `mul` multiplies it.

| `type` | Fields | Example |
| --- | --- | --- |
| `unitStat` | `stat` (`attack`, `defense`, `move`, `vision`, `maxHp`, `rangeMin`, `rangeMax`), `add`/`mul`, filter | `{ "type": "unitStat", "stat": "move", "add": 1, "tags": ["cavalry"] }` |
| `unitCost` | `add`/`mul`, filter | `{ "type": "unitCost", "tags": ["siege"], "mul": 0.75 }` |
| `moveCost` | `terrain` (ids), optional `moveTypes`, `set` (a number, or `null` for impassable) or `add` | `{ "type": "moveCost", "terrain": ["forest"], "set": 1 }` |
| `terrainDefense` | `add`, optional `terrain` (ids) and/or `ownBuildings: true`, filter | `{ "type": "terrainDefense", "ownBuildings": true, "add": 2 }` |
| `income` | `add`/`mul` | `{ "type": "income", "mul": 1.25 }` |
| `heal` | `buildings` (extra HP on own buildings), `anywhere` (HP every turn) | `{ "type": "heal", "anywhere": 1 }` |
| `captureStrength` | `add`, filter | `{ "type": "captureStrength", "add": 1 }` |
| `damageVs` | `vs` (a unit filter for the target), `mul`, filter for the attacker | `{ "type": "damageVs", "vs": { "tags": ["cavalry"] }, "mul": 1.2 }` |

### Terrain

| Field | Notes |
| --- | --- |
| `id`, `name` | |
| `char` | One character, unique among terrains, used in map `rows`. Base game: `.` plains, `=` road, `b` bridge, `f` forest, `h` hills, `^` mountain, `:` ford, `~` river. |
| `defense` | Added to the defense of a unit standing here (may be negative). |
| `moveCost` | Cost per move type, e.g. `{ "foot": 2, "mounted": 3 }`. A missing move type cannot enter. |
| `hides` | `true`: with fog on, units here are only seen by adjacent enemies (like forest). |
| `visionBonus` | Extra sight for units standing here. |
| `sprite` | Terrain sprite id (`"terrain/<sprite>"`): your own or an existing one. |
| `autotile` | Optional: `"water"`, `"road"` or `"bridge"` to join up with neighbours like the base game's rivers and roads. |
| `minimap` | Palette index for map thumbnails. |

### Buildings

`id`, `name`, `char`, `defense`, `income` (gold per turn), `heal` (HP per turn),
`capturePoints`, `hq` (losing it loses the game), `produces` (unit ids), `moveCost`,
`aiValue` (how much the computer wants it, in gold), optional `sprite`, and `blurb`. A
building sprite needs an `idle` animation.

### Move types

`{ "id": "flying", "name": "Flying" }`. Every terrain and building that a new move type
may enter then needs a cost for it in its `moveCost`.

### Biomes (random maps)

| Field | Notes |
| --- | --- |
| `id`, `name`, `desc` | Shown in New Game and How to Play. |
| `layers` | Tried in order. A tile takes the `terrain` of the first layer whose `elevation` and `moisture` ranges (`[from, to)` between 0 and 1) both match. The last layer must have no ranges: it is the fallback. |
| `rivers` | 0 to 4 rivers to carve. |
| `scale` | Size of the noise features; bigger means larger patches. |
| `fog` | Whether fog of war is on by default for this biome. |
| `roles` | Optional terrain ids the generator uses for `clear` ground, `road`, `bridge`, `river` and `ford`. |

Random maps always link every keep by road and give every army the same ground, whatever
the layers produce.

### Maps

```jsonc
{
  "id": "my-map", "name": "My Map", "description": "Shown in New Game.",
  "startingGold": 300, "fog": false, "dayLimit": 0,
  "players": [{ "faction": "cobalt", "controller": "human" }, { "faction": "ember", "controller": "ai" }],
  "rows": ["..ff==..~~..", "..."],
  "buildings": [{ "type": "keep", "x": 1, "y": 1, "owner": 0 }, { "type": "village", "x": 5, "y": 2, "owner": null }],
  "units": [{ "type": "pikeman", "owner": 0, "x": 2, "y": 1 }]
}
```

`rows` is the terrain as text, one character per tile (all rows the same length). Give
each army a keep (or another `hq` building) unless the map is a pure skirmish like
Greenvale, where the only way to win is to rout the enemy. Maps are checked when loading: unknown characters, units on ground
they can't stand on, buildings on rivers and so on. A broken map is left out with a notice
instead of failing the whole mod.

### Rules

| Field | Base value | What it does |
| --- | --- | --- |
| `defensePerPoint` | 0.1 | Damage reduction per defense point. |
| `luckMax` | 1 | Extra damage a strike may roll when Luck is on. |
| `captureStrength` | `{ "healthy": 2, "wounded": 1, "woundedBelow": 0.5 }` | Capture points per turn, and the HP fraction below which a unit counts as wounded. |
| `scorePerBuilding` | 100 | Score per building when a day limit runs out. |
| `startingArmy` | `["pikeman", "pikeman", "archer", "rider"]` | Each army's units on random maps (factions swap in their own versions). |
| `startingGold` | 300 | Gold on random maps. |

## Sprites

Sprites are 16×16 grids of characters. Each character is a colour from the
[palette](#palette); `.` is transparent, and `1`, `2`, `3` are the team colours (light,
mid, dark), which are swapped for each army's own.

```json
"sprites": {
  "units/golem": {
    "fps": 2,
    "frames": {
      "idle":   [ ["16 rows of 16 characters", "..."], ["second frame", "..."] ],
      "attack": [ ["one frame", "..."] ]
    }
  }
}
```

| Kind | Key | Animations |
| --- | --- | --- |
| Unit | `units/<id>` | `idle` (usually 2 frames) and `attack` (1 frame) |
| Building | `buildings/<id>` | `idle` |
| Terrain | `terrain/<id>` | `default` |

A sprite may include a `legend` object to use its own characters, e.g.
`"legend": { "Q": 28 }`. A mod can also replace a base game sprite by using its key (for
example `units/pikeman`). Every unit, building and terrain must end up with a sprite,
either its own or one borrowed through its `sprite` field. The base game's sprites in
`src/data/sprites/` show the style.

### Palette

The DawnBringer 32 palette, with the characters the base game uses for each colour:

| # | Colour | Char | # | Colour | Char | # | Colour | Char | # | Colour | Char |
| --: | --- | :-: | --: | --- | :-: | --: | --- | :-: | --: | --- | :-: |
| 0 | `#000000` | `z` | 8 | `#fbf236` | `y` | 16 | `#306082` | `V` | 24 | `#696a6a` | `d` |
| 1 | `#222034` | `k` | 9 | `#99e550` | `l` | 17 | `#5b6ee1` | `u` | 25 | `#595652` | `x` |
| 2 | `#45283c` | `h` | 10 | `#6abe30` | `e` | 18 | `#639bff` | `v` | 26 | `#76428a` | `p` |
| 3 | `#663931` | `B` | 11 | `#37946e` | `m` | 19 | `#5fcde4` | `c` | 27 | `#ac3232` | `r` |
| 4 | `#8f563b` | `b` | 12 | `#4b692f` | `E` | 20 | `#cbdbfc` | `W` | 28 | `#d95763` | `R` |
| 5 | `#df7126` | `o` | 13 | `#524b24` | `T` | 21 | `#ffffff` | `w` | 29 | `#d77bba` | `P` |
| 6 | `#d9a066` | `S` | 14 | `#323c39` | `D` | 22 | `#9badb7` | `g` | 30 | `#8f974a` | `a` |
| 7 | `#eec39a` | `s` | 15 | `#3f3f74` | `n` | 23 | `#847e87` | `G` | 31 | `#8a6f30` | `t` |

## Saves

Saves remember which mods were on. A save that uses something from a mod that is now off
shows **NEEDS MODS** in the Load screen, with the mod names; turn them back on to load
it. Random maps are stored inside the save, so they load as long as their terrain exists.

## Checking a mod while you work on it

- Import it and look at the Mods screen: problems are listed under the mod's name.
- Developers can put it in `public/mods/` and list it in `index.json`. `npm test` then
  loads every bundled mod, checks its sprites and plays its new content with the AI
  (`src/game/bundledMods.test.ts`; add your mod's id to the list it expects).
