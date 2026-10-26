// Core game types. Everything in GameState must stay plain JSON (no classes, Maps or Sets)
// so a state can be saved, cloned and compared freely.

export interface Coord {
  x: number;
  y: number;
}

/** Movement class id from moveTypes.json (e.g. "foot", "mounted", "wheeled"). */
export type MoveType = string;

export type Controller = 'human' | 'ai';

// ---------------------------------------------------------------------------
// Static definitions (loaded from src/data/*.json and mods)

/** One rule of a biome: tiles whose noise values fall in the given ranges become `terrain`. */
export interface BiomeLayer {
  terrain: string;
  /** Inclusive-exclusive [from, to) ranges in 0..1; a missing range matches anything. */
  elevation?: [number, number];
  moisture?: [number, number];
}

/** Recipe for procedurally generated maps (biomes.json). Layers are tried in order. */
export interface BiomeDef {
  id: string;
  name: string;
  desc?: string;
  layers: BiomeLayer[];
  /** Rivers to carve (each is mirrored for fairness). */
  rivers: number;
  /** Feature size of the noise; larger values make bigger blobs of forest, hills... */
  scale?: number;
  /** Suggested fog setting for maps of this biome. */
  fog?: boolean;
  /** Terrain ids the generator uses for special features (defaults in parentheses). */
  roles?: {
    /** Cleared ground around keeps and under buildings ("plains"). */
    clear?: string;
    road?: string;
    bridge?: string;
    river?: string;
    ford?: string;
  };
}

export interface MoveTypeDef {
  id: string;
  name: string;
}

/** Game-wide constants (rules.json). Mods can override any of them. */
export interface RulesDef {
  /** Damage reduction per point of defense (0.1 = 10%). */
  defensePerPoint: number;
  /** Extra damage a strike may roll when the luck option is on. */
  luckMax: number;
  /** Capture points per capture action for healthy and wounded units. */
  captureStrength: { healthy: number; wounded: number; woundedBelow: number };
  /** Day-limit score per building held. */
  scorePerBuilding: number;
  /** Army each player starts with on generated maps. */
  startingArmy: string[];
  /** Gold each player starts with on generated maps. */
  startingGold: number;
}

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
  /** Palette index used for map thumbnails. */
  minimap?: number;
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
  /** Free-form labels (e.g. "infantry", "cavalry", "ranged") that faction perks can target. */
  tags: string[];
  /** Sprite id under sprites/units (defaults to the unit id). */
  sprite?: string;
  blurb: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  /** Character used in map files' building layer (informational). */
  char: string;
  /** Defense bonus for a unit standing on the building (replaces the terrain's). */
  defense: number;
  /** Gold paid to the owner at the start of each of their turns. */
  income: number;
  /** HP restored to the owner's units standing here at the start of each turn. */
  heal: number;
  /** Capture points needed to take the building. */
  capturePoints: number;
  /** Losing this building eliminates its owner. */
  hq: boolean;
  /** Unit types that can be built here. */
  produces: string[];
  moveCost: Partial<Record<MoveType, number>>;
  /** How much the AI wants to capture this building (gold-equivalent). */
  aiValue: number;
  /** Sprite id under sprites/buildings (defaults to the building id). */
  sprite?: string;
  blurb: string;
}

/** Which units an effect applies to: listed ids and/or tags (neither = every unit). */
export interface UnitFilter {
  units?: string[];
  tags?: string[];
}

export type UnitStat = 'attack' | 'defense' | 'move' | 'vision' | 'maxHp' | 'rangeMin' | 'rangeMax';

/** A single rule change granted by a faction perk. All numbers are applied in data order. */
export type Effect =
  | ({ type: 'unitStat'; stat: UnitStat; add?: number; mul?: number } & UnitFilter)
  | ({ type: 'unitCost'; add?: number; mul?: number } & UnitFilter)
  | { type: 'moveCost'; terrain: string[]; moveTypes?: string[]; set?: number | null; add?: number }
  | ({ type: 'terrainDefense'; terrain?: string[]; ownBuildings?: boolean; add: number } & UnitFilter)
  | { type: 'income'; add?: number; mul?: number }
  | { type: 'heal'; buildings?: number; anywhere?: number }
  | ({ type: 'captureStrength'; add: number } & UnitFilter)
  | ({ type: 'damageVs'; vs: UnitFilter; mul: number } & UnitFilter);

export interface PerkDef {
  name: string;
  /** Shown in the faction picker; generated from the effects when missing. */
  desc?: string;
  effects: Effect[];
}

export interface RosterDef {
  /** Swap a standard unit for a faction unit everywhere (barracks and map armies). */
  replace?: Record<string, string>;
  /** Extra units every production building can raise for this faction. */
  add?: string[];
  /** Units this faction can never raise. */
  remove?: string[];
}

export interface FactionDef {
  id: string;
  name: string;
  short: string;
  /** Palette indices [light, mid, dark] used to recolor team pixels. */
  ramp: [number, number, number];
  blurb?: string;
  perks?: PerkDef[];
  roster?: RosterDef;
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

export interface MapBuildingPlacement {
  type: string;
  x: number;
  y: number;
  /** Owning player index, or null for neutral. */
  owner: number | null;
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
  buildings?: MapBuildingPlacement[];
  /** Gold each player starts with. */
  startingGold?: number;
  /** Suggested fog setting for this map. */
  fog?: boolean;
  /** Suggested day limit for this map (0 or missing = none). */
  dayLimit?: number;
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

export interface Building {
  id: number;
  type: string;
  x: number;
  y: number;
  owner: number | null;
  /** In-progress capture by a unit standing on the building. */
  capture: { unitId: number; points: number } | null;
}

export interface PlayerStats {
  kills: number;
  losses: number;
  built: number;
  captured: number;
}

export interface PlayerState {
  faction: string;
  controller: Controller;
  eliminated: boolean;
  gold: number;
  stats: PlayerStats;
}

export interface GameOptions {
  fog: boolean;
  luck: boolean;
  /** Last day of the battle (0 = no limit). When it ends, the highest score wins. */
  dayLimit: number;
}

export interface GameState {
  version: number;
  mapId: string;
  width: number;
  height: number;
  /** Row-major terrain ids, length width * height. */
  terrain: string[];
  units: Unit[];
  buildings: Building[];
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
  | { type: 'attack'; unitId: number; targetId: number }
  | { type: 'capture'; unitId: number }
  | { type: 'build'; buildingId: number; unitType: string }
  | { type: 'wait'; unitId: number }
  | { type: 'endTurn' };

export type GameEvent =
  | { type: 'moved'; unitId: number; path: Coord[] }
  | { type: 'ambushed'; unitId: number; by: number; x: number; y: number }
  | { type: 'attacked'; attackerId: number; defenderId: number; damage: number; counter: boolean; hpAfter: number }
  | { type: 'died'; unitId: number; owner: number; x: number; y: number }
  | { type: 'waited'; unitId: number }
  | { type: 'captureProgress'; buildingId: number; unitId: number; points: number; required: number }
  | { type: 'captured'; buildingId: number; unitId: number; owner: number; previous: number | null }
  | { type: 'built'; buildingId: number; unitId: number; unitType: string }
  | { type: 'turnStarted'; player: number; round: number; income: number }
  | { type: 'healed'; unitId: number; amount: number }
  | { type: 'eliminated'; player: number }
  | { type: 'gameOver'; winner: number | null };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
