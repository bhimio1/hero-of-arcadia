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

## Next

- Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) so the web build goes live.
- Push a `v1.0.0` tag to produce the first desktop installers; sign them for Windows and
  macOS if distribution beyond friends is planned.
- Playtest and tune unit costs/stats and AI caution on each map.

## Later

- Campaign: a string of maps with a light story and carried-over veterans.
- Replay viewer: step through a saved game from its seed + action log.
- Procedurally generated maps (the map format and validation are ready for it).
- Faction perks (e.g. cheaper riders for one army, better healing for another).
- Smarter AI: look-ahead, focus fire, retreating wounded units to heal, scouting in fog.
- Keyboard-only cursor for choosing tiles without a mouse; gamepad support.
- Chiptune music tracks; more sound variety.
- Online multiplayer (the action log already makes games easy to sync).
- Map editor.
