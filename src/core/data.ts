// The active content: lookup tables for units, terrain, buildings, factions, biomes, maps
// and rules. It starts as the base game and can be replaced at boot with base + mods via
// setContent(). The exported records are refilled in place, so modules that imported them
// always see the current content.

import { BASE_PACK } from '../data';
import { resolveContent, type Content, type ContentLayer } from './content';
import { checkMap, type ContentIssue } from './validate';
import type { BiomeDef, BuildingDef, FactionDef, MapDef, MoveTypeDef, RulesDef, TerrainDef, UnitDef } from './types';

export class DataError extends Error {}

export const MOVE_TYPES: Record<string, MoveTypeDef> = {};
export const TERRAIN: Record<string, TerrainDef> = {};
export const UNITS: Record<string, UnitDef> = {};
export const BUILDINGS: Record<string, BuildingDef> = {};
export const FACTIONS: Record<string, FactionDef> = {};
export const BIOMES: Record<string, BiomeDef> = {};
export const MAPS: Record<string, MapDef> = {};
export const RULES = {} as RulesDef;

const TERRAIN_BY_CHAR: Record<string, string> = {};

let current: Content;
let version = 0;
let warnings: ContentIssue[] = [];

function refill<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, source);
}

/** Replaces the active content. Caches keyed on contentVersion() are invalidated. */
export function setContent(content: Content, contentWarnings: ContentIssue[] = []): void {
  current = content;
  version++;
  warnings = contentWarnings;
  refill(MOVE_TYPES, content.moveTypes);
  refill(TERRAIN, content.terrain);
  refill(UNITS, content.units);
  refill(BUILDINGS, content.buildings);
  refill(FACTIONS, content.factions);
  refill(BIOMES, content.biomes);
  refill(MAPS, content.maps);
  refill(RULES as unknown as Record<string, unknown>, content.rules as unknown as Record<string, unknown>);
  refill(TERRAIN_BY_CHAR, Object.fromEntries(Object.values(content.terrain).map((t) => [t.char, t.id])));
}

/** Resolves and activates the given layers (base first). Throws ContentError if invalid. */
export function loadContent(layers: ContentLayer[]): ContentIssue[] {
  const { content, warnings: w } = resolveContent(layers);
  setContent(content, w);
  return w;
}

/** The base game alone, as a single layer (mods are appended after it). */
export const BASE_LAYER: ContentLayer = { source: 'base', pack: BASE_PACK };

export function getContent(): Content {
  return current;
}

/** Increments whenever content changes; use it to key caches of derived data. */
export function contentVersion(): number {
  return version;
}

export function contentWarnings(): ContentIssue[] {
  return warnings;
}

function lookup<T>(table: Record<string, T>, id: string, kind: string): T {
  const v = table[id];
  if (!v) throw new DataError(`unknown ${kind} "${id}"`);
  return v;
}

export const getUnitDef = (id: string): UnitDef => lookup(UNITS, id, 'unit');
export const getTerrain = (id: string): TerrainDef => lookup(TERRAIN, id, 'terrain');
export const getBuildingDef = (id: string): BuildingDef => lookup(BUILDINGS, id, 'building');
export const getFaction = (id: string): FactionDef => lookup(FACTIONS, id, 'faction');
export const getMap = (id: string): MapDef => lookup(MAPS, id, 'map');
export const getBiome = (id: string): BiomeDef => lookup(BIOMES, id, 'biome');

/** Parses a map's ASCII rows into a row-major list of terrain ids. */
export function parseMapTerrain(map: MapDef): { width: number; height: number; terrain: string[] } {
  const height = map.rows.length;
  if (height === 0) throw new DataError(`map ${map.id}: no rows`);
  const width = map.rows[0].length;
  const terrain: string[] = [];
  map.rows.forEach((row, y) => {
    if (row.length !== width) throw new DataError(`map ${map.id}: row ${y} has length ${row.length}, expected ${width}`);
    for (const ch of row) {
      const id = map.legend?.[ch] ?? TERRAIN_BY_CHAR[ch];
      if (!id || !(id in TERRAIN)) throw new DataError(`map ${map.id}: unknown terrain char "${ch}" in row ${y}`);
      terrain.push(id);
    }
  });
  return { width, height, terrain };
}

/** Throws a DataError describing the first problem found in a map definition. */
export function validateMap(map: MapDef): void {
  const problem = checkMap(map, current);
  if (problem) throw new DataError(`map ${map.id}: ${problem}`);
}

/** Terrain id for a map character (e.g. "f" -> "forest"). */
export function terrainForChar(ch: string): string | undefined {
  return TERRAIN_BY_CHAR[ch];
}

loadContent([BASE_LAYER]);
