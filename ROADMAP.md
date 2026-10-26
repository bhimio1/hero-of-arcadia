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

## Next

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
