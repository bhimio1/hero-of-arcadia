import { getMap, getTerrain, getUnitDef, parseMapTerrain } from './data';
import { hashSeed } from './rng';
import { inBounds, toIndex } from './grid';
import type { Controller, Coord, GameState, MapDef, TerrainDef, Unit, UnitDef } from './types';

export const STATE_VERSION = 1;

export interface PlayerSetup {
  faction: string;
  controller: Controller;
}

/** Everything needed to start (and later replay) a game. */
export interface GameSetup {
  mapId: string;
  seed: number | string;
  /** Overrides for the map's player slots (faction / controller). */
  players?: PlayerSetup[];
  fog?: boolean;
  luck?: boolean;
}

export function createGame(setup: GameSetup, mapOverride?: MapDef): GameState {
  const map = mapOverride ?? getMap(setup.mapId);
  const { width, height, terrain } = parseMapTerrain(map);
  const players = map.players.map((slot, i) => ({
    faction: setup.players?.[i]?.faction ?? slot.faction,
    controller: setup.players?.[i]?.controller ?? slot.controller,
    eliminated: false,
  }));
  let nextUnitId = 1;
  const units: Unit[] = map.units.map((u) => ({
    id: nextUnitId++,
    type: u.type,
    owner: u.owner,
    x: u.x,
    y: u.y,
    hp: u.hp ?? getUnitDef(u.type).maxHp,
    moved: false,
    acted: false,
  }));
  return {
    version: STATE_VERSION,
    mapId: map.id,
    width,
    height,
    terrain,
    units,
    players,
    currentPlayer: 0,
    round: 1,
    nextUnitId,
    rng: hashSeed(setup.seed),
    options: { fog: setup.fog ?? map.fog ?? false, luck: setup.luck ?? false },
    winner: null,
    gameOver: false,
  };
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function getUnit(state: GameState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

export function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((u) => u.x === x && u.y === y);
}

export function terrainAt(state: GameState, x: number, y: number): TerrainDef {
  return getTerrain(state.terrain[toIndex(state.width, x, y)]);
}

export function isInside(state: GameState, c: Coord): boolean {
  return inBounds(state.width, state.height, c.x, c.y);
}

export function unitDef(unit: Unit): UnitDef {
  return getUnitDef(unit.type);
}

/** Movement point cost for a move type to enter a tile, or undefined if impassable. */
export function moveCostAt(state: GameState, moveType: UnitDef['moveType'], x: number, y: number): number | undefined {
  return terrainAt(state, x, y).moveCost[moveType];
}

export function unitsOf(state: GameState, player: number): Unit[] {
  return state.units.filter((u) => u.owner === player);
}
