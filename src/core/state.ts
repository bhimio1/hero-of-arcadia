import { getBuildingDef, getMap, getTerrain, getUnitDef, parseMapTerrain } from './data';
import { hashSeed } from './rng';
import { inBounds, toIndex } from './grid';
import type { Building, BuildingDef, Controller, Coord, GameState, MapDef, TerrainDef, Unit, UnitDef } from './types';

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
  dayLimit?: number;
  /** AI personality for computer-controlled players (not used by the rules). */
  aiStyle?: 'greedy' | 'cautious' | 'reckless';
}

export function createGame(setup: GameSetup, mapOverride?: MapDef): GameState {
  const map = mapOverride ?? getMap(setup.mapId);
  const { width, height, terrain } = parseMapTerrain(map);
  const players = map.players.map((slot, i) => ({
    faction: setup.players?.[i]?.faction ?? slot.faction,
    controller: setup.players?.[i]?.controller ?? slot.controller,
    eliminated: false,
    gold: map.startingGold ?? 0,
    stats: { kills: 0, losses: 0, built: 0, captured: 0 },
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
  const buildings: Building[] = (map.buildings ?? []).map((b, i) => ({
    id: i + 1,
    type: b.type,
    x: b.x,
    y: b.y,
    owner: b.owner,
    capture: null,
  }));
  const state: GameState = {
    version: STATE_VERSION,
    mapId: map.id,
    width,
    height,
    terrain,
    units,
    buildings,
    players,
    currentPlayer: 0,
    round: 1,
    nextUnitId,
    rng: hashSeed(setup.seed),
    options: { fog: setup.fog ?? map.fog ?? false, luck: setup.luck ?? false, dayLimit: setup.dayLimit ?? map.dayLimit ?? 0 },
    winner: null,
    gameOver: false,
  };
  // the first player collects income for their opening turn like everyone else will
  state.players[0].gold += incomeOf(state, 0);
  return state;
}

/** Battle score used when the day limit runs out: army value plus 100 per building held. */
export function scoreOf(state: GameState, player: number): number {
  let score = 0;
  for (const u of state.units) {
    if (u.owner !== player) continue;
    const def = getUnitDef(u.type);
    score += (def.cost * u.hp) / def.maxHp;
  }
  for (const b of state.buildings) if (b.owner === player) score += 100;
  return Math.round(score);
}

/** Gold a player collects at the start of their turn. */
export function incomeOf(state: GameState, player: number): number {
  let total = 0;
  for (const b of state.buildings) if (b.owner === player) total += getBuildingDef(b.type).income;
  return total;
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

const buildingIndex = new WeakMap<Building[], Map<number, Building>>();

/** The building on a tile, if any. Building positions never change during a game. */
export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  let index = buildingIndex.get(state.buildings);
  if (!index) {
    index = new Map(state.buildings.map((b) => [toIndex(state.width, b.x, b.y), b]));
    buildingIndex.set(state.buildings, index);
  }
  return index.get(toIndex(state.width, x, y));
}

export function getBuilding(state: GameState, id: number): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

const buildingTerrain = new Map<string, TerrainDef>();

/** Buildings act as terrain for movement and defense. */
function buildingAsTerrain(def: BuildingDef): TerrainDef {
  let t = buildingTerrain.get(def.id);
  if (!t) {
    t = { id: def.id, name: def.name, char: def.char, defense: def.defense, moveCost: def.moveCost, sprite: 'plains' };
    buildingTerrain.set(def.id, t);
  }
  return t;
}

/** Effective terrain of a tile: the building on it if there is one, else the ground. */
export function terrainAt(state: GameState, x: number, y: number): TerrainDef {
  const b = state.buildings.length > 0 ? buildingAt(state, x, y) : undefined;
  if (b) return buildingAsTerrain(getBuildingDef(b.type));
  return getTerrain(state.terrain[toIndex(state.width, x, y)]);
}

/** The ground terrain under a tile, ignoring buildings (for rendering). */
export function groundAt(state: GameState, x: number, y: number): TerrainDef {
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
