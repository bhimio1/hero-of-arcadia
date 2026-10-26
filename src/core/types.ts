// Core game types. Everything in GameState must stay plain JSON (no classes, Maps or Sets)
// so a state can be saved, cloned and compared freely.

export interface Coord {
  x: number;
  y: number;
}

export type MoveType = 'foot' | 'mounted' | 'wheeled';
export const MOVE_TYPES: readonly MoveType[] = ['foot', 'mounted', 'wheeled'];

export type Controller = 'human' | 'ai';

// ---------------------------------------------------------------------------
// Static definitions (loaded from src/data/*.json)

export interface TerrainDef {
  id: string;
  name: string;
  /** Single character used for this terrain in map files. */
  char: string;
  /** Added to a defending unit's defense. May be negative. */
  defense: number;
  /** Movement point cost per move type. A missing entry means impassable. */
  moveCost: Partial<Record<MoveType, number>>;
  /** Units standing here can only be seen by adjacent enemies (fog of war). */
  hides?: boolean;
  /** Extra vision range for units standing here. */
  visionBonus?: number;
  sprite: string;
  autotile?: 'road' | 'bridge' | 'water';
}

export interface UnitDef {
  id: string;
  name: string;
  cost: number;
  maxHp: number;
  attack: number;
  defense: number;
  move: number;
  moveType: MoveType;
  /** Inclusive [min, max] Manhattan attack range. */
  range: [number, number];
  vision: number;
  /** If false the unit can either move or attack in a turn, not both. */
  moveAndFire: boolean;
  /** Whether the unit strikes back when attacked within its range. */
  counter: boolean;
  canCapture: boolean;
  /** Damage multipliers against specific unit types. */
  bonusVs: Record<string, number>;
  blurb: string;
}

export interface FactionDef {
  id: string;
  name: string;
  short: string;
  /** Palette indices [light, mid, dark] used to recolor team pixels. */
  ramp: [number, number, number];
}

// ---------------------------------------------------------------------------
// Maps

export interface MapUnitPlacement {
  type: string;
  owner: number;
  x: number;
  y: number;
  hp?: number;
}

export interface MapPlayerSlot {
  faction: string;
  controller: Controller;
}

export interface MapDef {
  id: string;
  name: string;
  description: string;
  /** Maps terrain characters to terrain ids. Falls back to each terrain's `char`. */
  legend?: Record<string, string>;
  rows: string[];
  players: MapPlayerSlot[];
  units: MapUnitPlacement[];
  /** Gold each player starts with. */
  startingGold?: number;
  /** Suggested fog setting for this map. */
  fog?: boolean;
}

// ---------------------------------------------------------------------------
// Dynamic state

export interface Unit {
  id: number;
  type: string;
  owner: number;
  x: number;
  y: number;
  hp: number;
  /** Has moved this turn. */
  moved: boolean;
  /** Has finished its turn (attacked, waited, ...). */
  acted: boolean;
}

export interface PlayerState {
  faction: string;
  controller: Controller;
  eliminated: boolean;
}

export interface GameOptions {
  fog: boolean;
  luck: boolean;
}

export interface GameState {
  version: number;
  mapId: string;
  width: number;
  height: number;
  /** Row-major terrain ids, length width * height. */
  terrain: string[];
  units: Unit[];
  players: PlayerState[];
  currentPlayer: number;
  /** Round counter ("day"), starts at 1 and increments when play wraps to player 0. */
  round: number;
  nextUnitId: number;
  /** Seeded PRNG state. */
  rng: number;
  options: GameOptions;
  winner: number | null;
  gameOver: boolean;
}

// ---------------------------------------------------------------------------
// Actions and events

export type Action =
  | { type: 'move'; unitId: number; path: Coord[] }
  | { type: 'wait'; unitId: number }
  | { type: 'endTurn' };

export type GameEvent =
  | { type: 'moved'; unitId: number; path: Coord[] }
  | { type: 'waited'; unitId: number }
  | { type: 'turnStarted'; player: number; round: number };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
