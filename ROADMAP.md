# Roadmap

## Done

- **M1 — Map, camera, movement.** Vite + TypeScript + Phaser 3 scaffold, 480×270 internal
  resolution with whole-number scaling, DawnBringer 32 palette, sprites baked from JSON
  pixel grids with team-colour swapping, Press Start 2P baked into a 1-bit bitmap font,
  terrain autotiling (roads, bridges, shorelines), camera pan (arrows/WASD/drag), blinking
  cursor, unit selection with Dijkstra movement range and path preview, animated moves.

- **M2 — Factions, turns, combat, victory.** Turn order with day counter and turn banner,
  action menu (Attack / Wait), targeting, damage formula with per-unit bonuses and HP
  scaling, counterattacks (ranged and siege units are safe from melee replies), unit death,
  elimination and last-army-standing victory, game-over screen with kills/losses, enemy
  threat-range inspection, end-turn confirmation, Web Audio chiptune sound effects.
  Both armies are human-controlled (hot-seat) until the AI lands in M4.

- **M3 — Terrain, combat preview, undo.** Terrain defense applies to every strike (forest
  +2, hills +2, mountain +4, ford −1), counters use the attacker's new tile, a combat
  preview window shows damage and resulting HP both ways (as a range when luck is on),
  targets can be cycled with arrows/Tab and confirmed with Enter, and a move can be taken
  back with Esc or Ctrl+Z until the unit acts.

- **M4 — AI opponent.** `AiController` interface (one action at a time, re-asked after
  every action) with a greedy implementation: scores every unit's attacks (damage value,
  kill bonus, counter cost) and moves (progress toward attack positions, cover, threat of
  enemy strikes next turn; ranged units hang back), growing bolder as games drag on.
  AI turns are animated with intent previews. Tests cover target choice, advancing,
  move-and-fire rules, and AI-vs-AI games that must finish with only legal actions, plus
  a random-play fuzz test for state invariants.

- **M5 — Economy.** Keeps, barracks and villages (data-driven in `buildings.json`):
  they act as terrain (defense, movement), pay income each turn, heal units +2 HP, and can
  be captured (4 points; healthy units add 2 per turn, badly wounded ones 1; walking away
  resets progress). Barracks raise one unit per turn. Capturing an enemy keep eliminates
  that army; an army with no units and nowhere to recruit is routed. Optional day limit
  ends the battle on score (army value + 100 per building). New map *First Ford*.
  The AI captures, keeps barracks clear, and buys troops scored against the enemy army.

- **M6 — Menus, save/load, settings.** Title screen over a live, dithered battlefield;
  New Game setup (map with thumbnail, player/CPU per army, fog, luck, day limit, CPU
  style); pause menu (resume, save, load, settings, quit); four save slots including an
  autosave kept current after every completed order, so *Continue* resumes where you left
  off. Saves hold setup + action log + snapshot and are verified by replaying the log.
  Settings (sound volume, zoom, animation speed, map grid, end-turn confirmation) persist
  in localStorage and apply immediately. Tests: save round-trip, replay determinism,
  tamper detection, corrupt/foreign/old saves rejected, slot storage.

- **M7 — Fog, new units, maps, hot-seat.** Fog of war: vision per unit (+1 on hills, +2 on
  mountains), forests hide units from anyone not adjacent, owned buildings see their own
  tile. The AI only ever receives its `playerView`, so it cannot see through fog. Moving
  into a hidden enemy springs an ambush (the move stops short and the unit's turn ends), a
  move that reveals enemies can't be undone, and hidden units can't be targeted. Three new
  units (Scout: fast, long sight; Shieldbearer: heavy, arrow-proof capturer; Battlemage:
  1–2 range firepower) and three new maps: *Highland Pass* (fog, mountain passes),
  *Wildwood* (fog, dense forest), *Four Crowns* (four-army free-for-all). Hot-seat for up
  to four players with a handover screen between human turns when fog is on.

- **M8 — Releases.** GitHub Actions: CI (lint, tests, build) on branches and pull
  requests; GitHub Pages deploy on every push to `main`; Tauri desktop builds (Windows,
  macOS Apple Silicon + Intel, Linux) attached to a draft release on `v*` tags. Tauri 2
  desktop shell with generated icons (the Linux `.deb` was built and launched locally).
  Also: How to Play screen with tables generated from the data files, PNG overrides
  for hand-drawn unit/building art, README with screenshots and modding guide.

- **M9 — Data-driven core.** All content flows through a layered content system: packs
  (the base game, later mods) are merged by id (patch a single field, add entries, remove
  entries), then validated as a whole with precise error paths; a broken map is dropped
  with a warning instead of breaking the game. Movement types, game constants
  (`rules.json`), terrain flags and minimap colours, AI building values and unit tags are
  data. A faction effects engine (`stats.ts`) computes every effective number — unit
  stats and costs, movement costs, terrain defense, damage bonuses, income, healing,
  capture strength and rosters — from base data plus faction perks, cached per content
  version. Rules, AI, fog and UI all read effective values.

- **M10 — Eight factions.** Four new factions (Violet Covenant, Tide Wardens, Fen Clans,
  Ivory Order) join the original four, and all eight have perks defined purely in data
  (unit stats and costs, movement, terrain defense, income, healing). Five faction-only
  units with new sprites (Berserker, Ranger, Hexer, Corsair, Knight) swap in through
  roster replacements, including in maps' starting armies. Perk descriptions are
  generated from the effect data. New Game is now two pages: battlefield, then armies
  (faction and player/CPU per army) with a faction info panel. Team colours come from
  the active factions; How to Play gains unit pages and faction pages. Tests: every
  faction plays under the AI; perk-free test factions keep rules tests independent of
  balance.

- **M11 — Procedural maps.** A seeded generator (`procgen.ts`) builds maps from biome
  recipes in `biomes.json` (Temperate, Woodland, Highlands, Riverlands, Steppe): value
  noise for elevation and moisture mapped to terrain layers, rivers, cleared start areas,
  cheapest-path roads with bridges, fords, keeps, barracks and villages, and starting
  armies from `rules.json`. Maps are symmetric (half turn for two armies, quarter turn
  for four) so they are fair by construction. New Game gains a RANDOM map with biome,
  size, armies, building density and seed (reroll, or step through seeds) and a live
  thumbnail. Generated maps travel inside the game setup and saves. Tests: 90 option
  combinations are valid, symmetric, fair and connected for every movement type; the
  AI plays generated maps to a finish; saves on generated maps replay exactly.

- **M12 — Mod support.** Mods are single JSON files (`format`, `id`, `name`, `version`,
  `content`, `remove`, `sprites`, optional `requires`) layered over the base game in a
  player-chosen order. Each mod is checked on top of the ones before it: content
  validation plus sprite checks (well-formed 16×16 grids, every unit, building and
  terrain drawable); a failing mod is left out with its exact problems while the rest
  load. In game: a Mods screen to turn mods on and off, reorder, import files (kept in
  localStorage) and remove them, with errors shown live; changes re-bake sprites and
  team colours without a reload. Saves record their mods and explain which are missing.
  Three bundled example mods in `public/mods/` (Frost Giants: faction, unit and sprite;
  Marshlands: terrain, terrain sprite, biome and the Mirefen map; Iron Rules: patches,
  rules and removal). `MODDING.md` documents the format. Tests: mod parsing, ordering,
  isolation of broken mods, `requires`, save stamps, sprite checks, and every bundled
  mod loading and playing under the AI.

## Next

- Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) so the web build goes live.
- Push a `v1.0.0` tag to produce the first desktop installers; sign them for Windows and
  macOS if distribution beyond friends is planned.
- Playtest and tune unit costs/stats and AI caution on each map.

## Later

- Campaign: a string of maps with a light story and carried-over veterans.
- Replay viewer: step through a saved game from its seed + action log.
- Smarter AI: look-ahead, focus fire, retreating wounded units to heal, scouting in fog.
- Keyboard-only cursor for choosing tiles without a mouse; gamepad support.
- Chiptune music tracks; more sound variety.
- Online multiplayer (the action log already makes games easy to sync).
- Map editor (exporting maps as mods).
- Sprites as PNG files inside mods, and a mod browser for sharing them.
