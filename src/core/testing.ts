// Helpers for unit tests: build small ad-hoc maps without touching the bundled data files.
import { createGame, type GameSetup } from './state';
import type { GameState, MapDef, MapUnitPlacement } from './types';

export function makeMap(rows: string[], units: MapUnitPlacement[], extra: Partial<MapDef> = {}): MapDef {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    rows,
    players: [
      { faction: 'cobalt', controller: 'human' },
      { faction: 'ember', controller: 'ai' },
    ],
    units,
    ...extra,
  };
}

export function makeGame(
  rows: string[],
  units: MapUnitPlacement[],
  setup: Partial<GameSetup> = {},
  extra: Partial<MapDef> = {},
): GameState {
  return createGame({ mapId: 'test', seed: 1, ...setup }, makeMap(rows, units, extra));
}
