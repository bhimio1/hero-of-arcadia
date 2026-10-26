// Helpers for unit tests: build small ad-hoc maps without touching the bundled data files.
import type { ContentLayer } from './content';
import { BASE_LAYER, loadContent } from './data';
import { createGame, type GameSetup } from './state';
import type { GameState, MapDef, MapUnitPlacement } from './types';

/**
 * Two factions without perks, so rules tests check the base rules rather than faction
 * balance. They are loaded on top of the base game whenever this module is imported.
 */
export const TEST_LAYER: ContentLayer = {
  source: 'test',
  pack: {
    factions: [
      { id: 'alpha', name: 'Alpha', short: 'Alpha', ramp: [18, 17, 15] },
      { id: 'beta', name: 'Beta', short: 'Beta', ramp: [28, 27, 2] },
    ],
  },
};
loadContent([BASE_LAYER, TEST_LAYER]);

export function makeMap(rows: string[], units: MapUnitPlacement[], extra: Partial<MapDef> = {}): MapDef {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    rows,
    players: [
      { faction: 'alpha', controller: 'human' },
      { faction: 'beta', controller: 'ai' },
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
