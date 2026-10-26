// Mods: JSON files that layer extra content over the base game. A mod can add or patch
// units, terrain, buildings, factions, biomes and maps, change the rules, remove entries
// and bring its own pixel sprites. Mods are applied one by one on top of the base game;
// a mod that would leave the content invalid is left out (with the reasons) and the rest
// still load, so one broken mod never stops the game from starting.
//
// This module is pure: reading files and storing the player's mod list is the game's job.

import { CATEGORIES, ContentError, resolveContent, type Category, type Content, type ContentLayer, type ContentPack } from './content';
import { BASE_LAYER, setContent } from './data';
import type { ContentIssue } from './validate';

export const MOD_FORMAT = 'hero-of-arcadia-mod';

export interface ModManifest {
  format: typeof MOD_FORMAT;
  /** Unique id: lower-case letters, digits and dashes. */
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** Ids of mods that must be loaded before this one. */
  requires?: string[];
  /** Entries to add, or to patch when the id already exists (see content.ts). */
  content?: ContentPack;
  /** Ids to delete, per category, after this mod's content is applied. */
  remove?: Partial<Record<Category, string[]>>;
  /** Pixel-grid sprites keyed "units/<id>", "buildings/<id>" or "terrain/<id>" (checked by the renderer). */
  sprites?: Record<string, unknown>;
}

/** What a save remembers about each mod it was played with. */
export interface ModStamp {
  id: string;
  name: string;
  version: string;
}

export class ModError extends Error {}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CONTENT_KEYS = new Set<string>([...CATEGORIES, 'rules']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parses and checks the shape of a mod file. Throws ModError with a readable reason. */
export function parseMod(input: unknown): ModManifest {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new ModError('the file is not valid JSON');
    }
  }
  if (!isObject(data)) throw new ModError('the file is not a mod');
  const d = data;
  if (d.format !== MOD_FORMAT) throw new ModError(`"format" must be "${MOD_FORMAT}"`);
  if (typeof d.id !== 'string' || !ID_PATTERN.test(d.id)) throw new ModError('"id" must use only lower-case letters, digits and dashes');
  if (typeof d.name !== 'string' || d.name.trim() === '') throw new ModError('"name" is required');
  if (typeof d.version !== 'string' || d.version.trim() === '') throw new ModError('"version" is required (e.g. "1.0.0")');
  for (const key of ['author', 'description'] as const) {
    if (d[key] !== undefined && typeof d[key] !== 'string') throw new ModError(`"${key}" must be text`);
  }
  if (d.requires !== undefined && (!Array.isArray(d.requires) || d.requires.some((r) => typeof r !== 'string'))) {
    throw new ModError('"requires" must be a list of mod ids');
  }
  if (d.content !== undefined) {
    if (!isObject(d.content)) throw new ModError('"content" must be an object');
    const unknown = Object.keys(d.content).filter((k) => !CONTENT_KEYS.has(k));
    if (unknown.length) throw new ModError(`unknown content section "${unknown[0]}" (use ${[...CONTENT_KEYS].join(', ')})`);
  }
  if (d.remove !== undefined) {
    if (!isObject(d.remove)) throw new ModError('"remove" must be an object of id lists');
    for (const [cat, ids] of Object.entries(d.remove)) {
      if (!(CATEGORIES as readonly string[]).includes(cat)) throw new ModError(`"remove" has unknown category "${cat}"`);
      if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw new ModError(`"remove.${cat}" must be a list of ids`);
    }
  }
  if (d.sprites !== undefined && !isObject(d.sprites)) throw new ModError('"sprites" must be an object');
  return d as unknown as ModManifest;
}

/** One-line descriptions of what a mod contains, e.g. ["2 units", "1 faction", "rules"]. */
export function modSummary(mod: ModManifest): string[] {
  const out: string[] = [];
  const label: Record<Category, [string, string]> = {
    moveTypes: ['move type', 'move types'],
    terrain: ['terrain', 'terrains'],
    units: ['unit', 'units'],
    buildings: ['building', 'buildings'],
    factions: ['faction', 'factions'],
    biomes: ['biome', 'biomes'],
    maps: ['map', 'maps'],
  };
  for (const cat of CATEGORIES) {
    const n = mod.content?.[cat]?.length ?? 0;
    if (n) out.push(`${n} ${label[cat][n === 1 ? 0 : 1]}`);
  }
  if (mod.content?.rules) out.push('rule changes');
  const sprites = Object.keys(mod.sprites ?? {}).length;
  if (sprites) out.push(`${sprites} sprite${sprites === 1 ? '' : 's'}`);
  const removed = Object.values(mod.remove ?? {}).reduce((n, ids) => n + (ids?.length ?? 0), 0);
  if (removed) out.push(`removes ${removed}`);
  return out;
}

export function modLayer(mod: ModManifest): ContentLayer {
  return { source: `mod:${mod.id}`, pack: mod.content ?? {}, remove: mod.remove };
}

export interface ModFailure {
  mod: ModManifest;
  issues: ContentIssue[];
}

export interface ModLoadResult {
  content: Content;
  warnings: ContentIssue[];
  /** Mods that were applied, in order. */
  loaded: ModManifest[];
  /** Mods that were left out, with the reasons. */
  failed: ModFailure[];
}

/**
 * Extra checks a host can run on each mod against the content it produces (the renderer
 * uses this to make sure every unit, building and terrain has a sprite).
 */
export type ModCheck = (content: Content, mod: ModManifest, loadedBefore: ModManifest[]) => ContentIssue[];

/**
 * Layers `mods` over the base game in order. Each mod is tried on top of the mods accepted
 * so far; if the result is invalid (or `check` objects) the mod is left out and reported,
 * and the remaining mods still get their turn. Nothing is activated (see applyMods).
 */
export function resolveMods(mods: ModManifest[], check?: ModCheck, base: ContentLayer = BASE_LAYER): ModLoadResult {
  let { content, warnings } = resolveContent([base]);
  const layers: ContentLayer[] = [base];
  const loaded: ModManifest[] = [];
  const failed: ModFailure[] = [];
  const fail = (mod: ModManifest, path: string, message: string) => failed.push({ mod, issues: [{ path, message }] });
  for (const mod of mods) {
    if (loaded.some((m) => m.id === mod.id) || failed.some((f) => f.mod.id === mod.id)) {
      fail(mod, `mod:${mod.id}`, 'this mod id is used twice');
      continue;
    }
    const missing = (mod.requires ?? []).filter((id) => !loaded.some((m) => m.id === id));
    if (missing.length) {
      fail(mod, `mod:${mod.id}.requires`, `needs ${missing.join(', ')} turned on and loaded before it`);
      continue;
    }
    const layer = modLayer(mod);
    try {
      const res = resolveContent([...layers, layer]);
      const issues = check?.(res.content, mod, loaded) ?? [];
      if (issues.length) {
        failed.push({ mod, issues });
        continue;
      }
      layers.push(layer);
      loaded.push(mod);
      content = res.content;
      warnings = res.warnings;
    } catch (e) {
      if (e instanceof ContentError) failed.push({ mod, issues: e.issues });
      else fail(mod, `mod:${mod.id}`, e instanceof Error ? e.message : String(e));
    }
  }
  return { content, warnings, loaded, failed };
}

/** The mods applied to the active content, in load order. */
export const ACTIVE_MODS: ModStamp[] = [];

/** Resolves `mods` (see resolveMods) and makes the result the active content. */
export function applyMods(mods: ModManifest[], check?: ModCheck): ModLoadResult {
  const res = resolveMods(mods, check);
  setContent(res.content, res.warnings);
  ACTIVE_MODS.splice(0, ACTIVE_MODS.length, ...res.loaded.map(({ id, name, version }) => ({ id, name, version })));
  return res;
}
