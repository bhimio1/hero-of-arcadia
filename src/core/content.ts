// Content packs and layering. The base game and every mod are "packs" of plain data.
// Packs are applied in order: an entry whose id already exists is deep-merged into it (so
// a mod can change one stat without repeating the rest), a new id adds an entry, and
// `remove` deletes entries. The merged result is then validated as a whole.

import { validateContent, type ContentIssue } from './validate';
import type { BiomeDef, BuildingDef, FactionDef, MapDef, MoveTypeDef, RulesDef, TerrainDef, UnitDef } from './types';

export const CATEGORIES = ['moveTypes', 'terrain', 'units', 'buildings', 'factions', 'biomes', 'maps'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Entries in a pack may be partial when they patch an existing id. */
type Partialish<T> = Partial<T> & { id: string };

export interface ContentPack {
  moveTypes?: Partialish<MoveTypeDef>[];
  terrain?: Partialish<TerrainDef>[];
  units?: Partialish<UnitDef>[];
  buildings?: Partialish<BuildingDef>[];
  factions?: Partialish<FactionDef>[];
  biomes?: Partialish<BiomeDef>[];
  maps?: Partialish<MapDef>[];
  rules?: Partial<RulesDef>;
}

export interface ContentLayer {
  /** Where this layer came from, e.g. "base" or "mod:dragon-riders" (used in messages). */
  source: string;
  pack: ContentPack;
  remove?: Partial<Record<Category, string[]>>;
}

export interface Content {
  moveTypes: Record<string, MoveTypeDef>;
  terrain: Record<string, TerrainDef>;
  units: Record<string, UnitDef>;
  buildings: Record<string, BuildingDef>;
  factions: Record<string, FactionDef>;
  biomes: Record<string, BiomeDef>;
  maps: Record<string, MapDef>;
  rules: RulesDef;
}

export class ContentError extends Error {
  constructor(readonly issues: ContentIssue[]) {
    super(`content has ${issues.length} problem(s):\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively merges `patch` into a copy of `base`. Arrays and primitives replace. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return structuredClone(patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in out && isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out as T;
}

export interface ResolveResult {
  content: Content;
  /** Problems that were worked around (e.g. a broken map that was left out). */
  warnings: ContentIssue[];
}

/**
 * Applies layers in order and validates the result. Throws ContentError when the content
 * cannot be used. Maps that fail validation are dropped with a warning instead, so one
 * broken map can't take the whole game down.
 */
export function resolveContent(layers: ContentLayer[]): ResolveResult {
  const tables = Object.fromEntries(CATEGORIES.map((c) => [c, new Map<string, Record<string, unknown>>()])) as Record<
    Category,
    Map<string, Record<string, unknown>>
  >;
  let rules: Record<string, unknown> = {};
  const issues: ContentIssue[] = [];
  for (const layer of layers) {
    for (const cat of CATEGORIES) {
      const entries = layer.pack[cat];
      if (entries === undefined) continue;
      if (!Array.isArray(entries)) {
        issues.push({ path: `${layer.source}.${cat}`, message: 'must be a list' });
        continue;
      }
      entries.forEach((entry, i) => {
        if (!isPlainObject(entry) || typeof entry.id !== 'string' || entry.id === '') {
          issues.push({ path: `${layer.source}.${cat}[${i}]`, message: 'entry needs a string "id"' });
          return;
        }
        const table = tables[cat];
        const prev = table.get(entry.id);
        table.set(entry.id, prev ? deepMerge(prev, entry) : structuredClone(entry));
      });
    }
    if (layer.pack.rules) rules = deepMerge(rules, layer.pack.rules);
    for (const [cat, ids] of Object.entries(layer.remove ?? {})) {
      if (!(CATEGORIES as readonly string[]).includes(cat)) {
        issues.push({ path: `${layer.source}.remove.${cat}`, message: 'unknown category' });
        continue;
      }
      for (const id of ids ?? []) tables[cat as Category].delete(id);
    }
  }
  if (issues.length) throw new ContentError(issues);
  const content = {
    ...(Object.fromEntries(CATEGORIES.map((c) => [c, Object.fromEntries(tables[c])])) as unknown as Omit<Content, 'rules'>),
    rules: rules as unknown as RulesDef,
  } as Content;
  pruneReferences(content);
  const { errors, badMaps } = validateContent(content);
  if (errors.length) throw new ContentError(errors);
  const warnings: ContentIssue[] = [];
  for (const [id, problem] of badMaps) {
    delete content.maps[id];
    warnings.push({ path: `maps.${id}`, message: `left out: ${problem}` });
  }
  if (Object.keys(content.maps).length === 0 && Object.keys(content.biomes).length === 0) {
    throw new ContentError([...warnings, { path: 'maps', message: 'nothing to play: no usable maps and no biomes for random maps' }]);
  }
  return { content, warnings };
}

/**
 * Drops references to units that no longer exist from lists where a missing entry is
 * harmless (what a barracks produces, damage bonuses, roster additions), so a mod can
 * remove a unit without patching every building and faction that mentioned it.
 */
function pruneReferences(c: Content): void {
  const known = (id: string) => id in c.units;
  for (const b of Object.values(c.buildings)) if (Array.isArray(b.produces)) b.produces = b.produces.filter(known);
  for (const u of Object.values(c.units)) {
    if (isPlainObject(u.bonusVs)) u.bonusVs = Object.fromEntries(Object.entries(u.bonusVs).filter(([k]) => known(k)));
  }
  for (const f of Object.values(c.factions)) {
    if (!f.roster) continue;
    if (Array.isArray(f.roster.add)) f.roster.add = f.roster.add.filter(known);
    if (Array.isArray(f.roster.remove)) f.roster.remove = f.roster.remove.filter(known);
    if (isPlainObject(f.roster.replace)) {
      f.roster.replace = Object.fromEntries(Object.entries(f.roster.replace).filter(([a, b]) => known(a) && known(b)));
    }
  }
  if (c.rules && Array.isArray(c.rules.startingArmy)) c.rules.startingArmy = c.rules.startingArmy.filter(known);
}
