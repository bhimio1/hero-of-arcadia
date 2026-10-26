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

## Next

- M3 — Terrain effects in combat, combat preview, undo move.
- M4 — Simple AI opponent.
- M5 — Economy: buildings, capture, income, production.
- M6 — Save/load, main menu, settings.
- M7 — Fog of war, more units, more maps.
- M8 — CI, GitHub Pages deploy, Tauri desktop builds.

## Later

- Hot-seat for 3–4 players.
- Replay viewer (step through a saved game from its seed + action log).
- Procedurally generated maps.
- Faction perks.
- Smarter AI (look-ahead, focus fire, retreat to heal).
- Chiptune music.
- Hand-drawn art to replace the procedural grids.
