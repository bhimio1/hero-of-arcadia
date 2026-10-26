// Loads the JSON data files into typed, validated lookup tables.
// All rules code reads definitions through these helpers instead of importing JSON directly.

import terrainJson from '../data/terrain.json';
import unitsJson from '../data/units.json';
import factionsJson from '../data/factions.json';
import { MAP_LIST } from '../data/maps';
import { MOVE_TYPES, type FactionDef, type MapDef, type TerrainDef, type UnitDef } from './types';

export class DataError extends Error {}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new DataError(msg);
}

function indexById<T extends { id: string }>(list: T[], kind: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of list) {
    assert(typeof item.id === 'string' && item.id.length > 0, `${kind} without id`);
    assert(!(item.id in out), `duplicate ${kind} id "${item.id}"`);
    out[item.id] = item;
  }
  return out;
}

export const TERRAIN: Record<string, TerrainDef> = indexById(terrainJson as TerrainDef[], 'terrain');
export const UNITS: Record<string, UnitDef> = indexById(unitsJson as UnitDef[], 'unit');
export const FACTIONS: Record<string, FactionDef> = indexById(factionsJson as FactionDef[], 'faction');
export const MAPS: Record<string, MapDef> = indexById(MAP_LIST, 'map');

export const UNIT_IDS = Object.keys(UNITS);
export const TERRAIN_IDS = Object.keys(TERRAIN);

const TERRAIN_BY_CHAR: Record<string, string> = {};
for (const t of Object.values(TERRAIN)) {
  assert(t.char.length === 1, `terrain ${t.id} char must be one character`);
  assert(!(t.char in TERRAIN_BY_CHAR), `terrain char "${t.char}" used twice`);
  TERRAIN_BY_CHAR[t.char] = t.id;
  for (const mt of Object.keys(t.moveCost)) {
    assert((MOVE_TYPES as string[]).includes(mt), `terrain ${t.id}: unknown move type ${mt}`);
  }
}

for (const u of Object.values(UNITS)) {
  assert((MOVE_TYPES as string[]).includes(u.moveType), `unit ${u.id}: unknown move type`);
  assert(u.range[0] >= 1 && u.range[1] >= u.range[0], `unit ${u.id}: bad range`);
  assert(u.maxHp > 0 && u.move > 0, `unit ${u.id}: bad stats`);
  for (const target of Object.keys(u.bonusVs)) {
    assert(target in UNITS, `unit ${u.id}: bonusVs unknown unit ${target}`);
  }
}

export function getTerrain(id: string): TerrainDef {
  const t = TERRAIN[id];
  if (!t) throw new DataError(`unknown terrain "${id}"`);
  return t;
}

export function getUnitDef(id: string): UnitDef {
  const u = UNITS[id];
  if (!u) throw new DataError(`unknown unit "${id}"`);
  return u;
}

export function getFaction(id: string): FactionDef {
  const f = FACTIONS[id];
  if (!f) throw new DataError(`unknown faction "${id}"`);
  return f;
}

export function getMap(id: string): MapDef {
  const m = MAPS[id];
  if (!m) throw new DataError(`unknown map "${id}"`);
  return m;
}

/** Parses a map's ASCII rows into a row-major list of terrain ids. */
export function parseMapTerrain(map: MapDef): { width: number; height: number; terrain: string[] } {
  const height = map.rows.length;
  assert(height > 0, `map ${map.id}: no rows`);
  const width = map.rows[0].length;
  const terrain: string[] = [];
  map.rows.forEach((row, y) => {
    assert(row.length === width, `map ${map.id}: row ${y} has length ${row.length}, expected ${width}`);
    for (const ch of row) {
      const id = map.legend?.[ch] ?? TERRAIN_BY_CHAR[ch];
      assert(id && id in TERRAIN, `map ${map.id}: unknown terrain char "${ch}" in row ${y}`);
      terrain.push(id);
    }
  });
  return { width, height, terrain };
}

/** Throws a DataError describing the first problem found in a map definition. */
export function validateMap(map: MapDef): void {
  const { width, height, terrain } = parseMapTerrain(map);
  assert(map.players.length >= 2, `map ${map.id}: needs at least two players`);
  for (const p of map.players) assert(p.faction in FACTIONS, `map ${map.id}: unknown faction ${p.faction}`);
  const seen = new Set<number>();
  for (const u of map.units) {
    assert(u.type in UNITS, `map ${map.id}: unknown unit type ${u.type}`);
    assert(u.owner >= 0 && u.owner < map.players.length, `map ${map.id}: bad unit owner ${u.owner}`);
    assert(u.x >= 0 && u.y >= 0 && u.x < width && u.y < height, `map ${map.id}: unit out of bounds`);
    const idx = u.y * width + u.x;
    assert(!seen.has(idx), `map ${map.id}: two units at ${u.x},${u.y}`);
    seen.add(idx);
    const cost = getTerrain(terrain[idx]).moveCost[getUnitDef(u.type).moveType];
    assert(cost !== undefined, `map ${map.id}: ${u.type} placed on impassable ${terrain[idx]} at ${u.x},${u.y}`);
  }
  for (let p = 0; p < map.players.length; p++) {
    assert(map.units.some((u) => u.owner === p), `map ${map.id}: player ${p} has no starting units`);
  }
}

for (const map of Object.values(MAPS)) validateMap(map);
