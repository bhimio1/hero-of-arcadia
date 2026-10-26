# Roadmap

## Done

- **M1 — Map, camera, movement.** Vite + TypeScript + Phaser 3 scaffold, 480×270 internal
  resolution with whole-number scaling, DawnBringer 32 palette, sprites baked from JSON
  pixel grids with team-colour swapping, Press Start 2P baked into a 1-bit bitmap font,
  terrain autotiling (roads, bridges, shorelines), camera pan (arrows/WASD/drag), blinking
  cursor, unit selection with Dijkstra movement range and path preview, animated moves.

## Next

- M2 — Two factions, turn system, attacking, unit death, win/lose screen.
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
