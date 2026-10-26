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

## Next

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
