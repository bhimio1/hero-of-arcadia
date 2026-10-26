# Hero of Arcadia

A retro pixel-art, turn-based tactics game for the browser. Lead the Cobalt League against
the Ember Host across hand-made maps: move, fight, capture and build until one banner stands.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest) for the rules engine and data files |
| `npm run lint` | ESLint plus a full TypeScript type check |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |

## Controls

| Input | Action |
| --- | --- |
| Left click | Select a unit, choose a destination, pick a menu entry or target |
| Click an enemy | Show the tiles it can threaten this turn |
| Drag, arrows, WASD | Pan the camera |
| Space | End turn (confirm in menus) |
| Enter | Confirm menu entry / attack the previewed target |
| Tab | Select the next unit that can still act (cycle targets while aiming) |
| Esc, right click | Cancel; after moving, undo the move |
| Ctrl+Z | Undo the last move (before the unit attacks or waits) |

## Project layout

```
src/
  core/        Rules engine: plain TypeScript, no Phaser, no DOM (enforced by ESLint)
  game/        Phaser: scenes, rendering, input, UI, audio
  data/        JSON content: units, terrain, factions, palette, maps, sprites
```

- **Rules** (`src/core`) are a pure reducer: `applyAction(state, action) -> { state, events }`.
  The UI and the AI both go through it. Game state is plain JSON.
- **Content** lives in `src/data/*.json`. Maps are ASCII rows plus a list of units.
- **Sprites** are 16×16 pixel grids in `src/data/sprites/**.json`. Each character maps to a
  palette colour in `sprites/legend.json`; `1`/`2`/`3` are the team colour ramp, swapped per faction.

## Credits

- Font: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38,
  SIL Open Font License 1.1 (bundled via `@fontsource/press-start-2p`).
- Palette: DawnBringer 32 by DawnBringer.
- Engine: [Phaser 3](https://phaser.io).

All game art, names and rules are original to this project.
