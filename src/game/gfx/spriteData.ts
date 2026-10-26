// Sprite sources: small pixel grids stored as JSON in src/data/sprites. This module only
// parses them into RGBA pixels (no Phaser), so it can be unit-tested and so the grids can
// later be replaced by hand-drawn PNGs without touching the renderer.

import legendJson from '../../data/sprites/legend.json';
import overridesJson from '../../data/sprites/overrides.json';
import type { ModCheck, ModManifest } from '../../core/mods';
import type { ContentIssue } from '../../core/validate';
import { DIM_MAP, PALETTE_RGB, TEAM_RAMPS } from './palette';

export type LegendValue = number | 'team.light' | 'team.mid' | 'team.dark' | null;
export type Grid = string[];

export interface SpriteFile {
  id: string;
  fps?: number;
  legend?: Record<string, LegendValue>;
  frames: Record<string, Grid[]>;
}

const DEFAULT_LEGEND = legendJson as Record<string, LegendValue>;

const modules = import.meta.glob<SpriteFile>('../../data/sprites/**/*.json', { eager: true, import: 'default' });

/** Sprite keys replaced by hand-drawn PNGs (see src/data/sprites/overrides.json). */
export const SPRITE_OVERRIDES: Record<string, string> = (overridesJson as { overrides: Record<string, string> }).overrides;

/** The game's own sprite files keyed by "<folder>/<id>", e.g. "units/pikeman". */
export const BASE_SPRITES: Record<string, SpriteFile> = {};
for (const [path, file] of Object.entries(modules)) {
  const m = /sprites\/(.+)\/([^/]+)\.json$/.exec(path);
  if (!m) continue; // legend.json and overrides.json sit at the root
  BASE_SPRITES[`${m[1]}/${m[2]}`] = file;
}

/** Active sprites: the game's own plus those of active mods (see setModSprites). */
export const SPRITES: Record<string, SpriteFile> = { ...BASE_SPRITES };

/** A mod's sprite entry as a sprite file (the id defaults to the key's last part). */
function modSpriteFile(key: string, raw: unknown): SpriteFile {
  const file = raw as SpriteFile;
  return { ...file, id: file.id ?? key.slice(key.indexOf('/') + 1) };
}

/** Rebuilds SPRITES from the base sprites plus each mod's sprites, in load order. */
export function setModSprites(mods: ModManifest[]): void {
  for (const k of Object.keys(SPRITES)) delete SPRITES[k];
  Object.assign(SPRITES, BASE_SPRITES);
  for (const mod of mods) {
    for (const [key, raw] of Object.entries(mod.sprites ?? {})) SPRITES[key] = modSpriteFile(key, raw);
  }
}

export function getSprite(key: string): SpriteFile {
  const s = SPRITES[key];
  if (!s) throw new Error(`missing sprite ${key}`);
  return s;
}

export function gridSize(grid: Grid): { w: number; h: number } {
  return { w: grid[0]?.length ?? 0, h: grid.length };
}

/** Problems with a sprite file (ragged rows, unknown legend chars); empty if valid. */
export function validateSprite(file: SpriteFile): string[] {
  const errors: string[] = [];
  const legend = { ...DEFAULT_LEGEND, ...file.legend };
  for (const [anim, frames] of Object.entries(file.frames)) {
    if (!Array.isArray(frames) || frames.length === 0) errors.push(`${file.id}.${anim}: no frames`);
    frames.forEach((grid, i) => {
      const { w } = gridSize(grid);
      grid.forEach((row, y) => {
        if (row.length !== w) errors.push(`${file.id}.${anim}[${i}] row ${y}: width ${row.length} != ${w}`);
        for (const ch of row) {
          if (!(ch in legend)) errors.push(`${file.id}.${anim}[${i}]: unknown char "${ch}"`);
        }
      });
      if (frames.some((f) => f.length !== grid.length || f[0].length !== w)) {
        errors.push(`${file.id}.${anim}: frames differ in size`);
      }
    });
  }
  return errors;
}

const SPRITE_KEY = /^(units|buildings|terrain)\/[a-z0-9][a-z0-9-]*$/;
const REQUIRED_ANIMS: Record<string, string[]> = { units: ['idle', 'attack'], buildings: ['idle'], terrain: ['default'] };
const TEAM_VALUES = new Set(['team.light', 'team.mid', 'team.dark']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Problems with the sprites a mod brings (shape, size, legend, animations). */
export function checkModSprites(mod: ModManifest): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const [key, raw] of Object.entries(mod.sprites ?? {})) {
    const path = `sprites["${key}"]`;
    const fail = (message: string) => issues.push({ path, message });
    if (!SPRITE_KEY.test(key)) {
      fail('key must look like "units/<id>", "buildings/<id>" or "terrain/<id>"');
      continue;
    }
    if (!isObject(raw) || !isObject(raw.frames)) {
      fail('needs "frames": { "<animation>": [ <16 rows of 16 characters>, ... ] }');
      continue;
    }
    const file = modSpriteFile(key, raw);
    let shapeOk = true;
    for (const [anim, frames] of Object.entries(file.frames)) {
      const grids = frames as unknown;
      const ok = Array.isArray(grids) && grids.length > 0 && grids.every((g) => Array.isArray(g) && g.length === 16 && g.every((row) => typeof row === 'string' && row.length === 16));
      if (!ok) {
        fail(`animation "${anim}" must be a list of frames, each 16 rows of 16 characters`);
        shapeOk = false;
      }
    }
    for (const anim of REQUIRED_ANIMS[key.split('/')[0]]) if (!file.frames[anim]) fail(`needs an "${anim}" animation`);
    if (file.legend !== undefined && !isObject(file.legend)) fail('"legend" must map characters to palette indices');
    for (const [ch, v] of Object.entries(isObject(file.legend) ? file.legend : {})) {
      const valid = v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < PALETTE_RGB.length) || TEAM_VALUES.has(v as string);
      if (ch.length !== 1) fail(`legend key "${ch}" must be a single character`);
      else if (!valid) fail(`legend "${ch}" must be null, a palette index 0-${PALETTE_RGB.length - 1} or team.light/team.mid/team.dark`);
    }
    if (shapeOk) for (const e of validateSprite(file)) fail(e);
  }
  return issues;
}

/**
 * Mod check for the content loader: the mod's sprites are well formed, and every unit,
 * building and terrain in the resulting content has a sprite to draw it with.
 */
export const modSpriteCheck: ModCheck = (content, mod, before) => {
  const issues = checkModSprites(mod);
  if (issues.length) return issues;
  const have = new Set([...Object.keys(BASE_SPRITES), ...[...before, mod].flatMap((m) => Object.keys(m.sprites ?? {}))]);
  const need = (path: string, key: string, example: string) => {
    if (!have.has(key)) issues.push({ path, message: `has no sprite: add "${key}" to the mod's sprites, or set "sprite" to an existing one such as "${example}"` });
  };
  for (const u of Object.values(content.units)) need(`units.${u.id}`, `units/${u.sprite ?? u.id}`, 'pikeman');
  for (const b of Object.values(content.buildings)) need(`buildings.${b.id}`, `buildings/${b.sprite ?? b.id}`, 'village');
  for (const t of Object.values(content.terrain)) need(`terrain.${t.id}`, `terrain/${t.sprite}`, 'plains');
  return issues;
};

export interface PixelOptions {
  team?: string;
  /** Map every colour through the palette's dim table. */
  dim?: boolean;
}

/** Resolves a grid to palette indices (or -1 for transparent). */
export function gridToIndices(grid: Grid, legend: Record<string, LegendValue> = {}, team = 'neutral'): number[] {
  const merged = { ...DEFAULT_LEGEND, ...legend };
  const ramp = TEAM_RAMPS[team] ?? TEAM_RAMPS.neutral;
  const out: number[] = [];
  for (const row of grid) {
    for (const ch of row) {
      const v = merged[ch];
      if (v === null || v === undefined) out.push(-1);
      else if (v === 'team.light') out.push(ramp[0]);
      else if (v === 'team.mid') out.push(ramp[1]);
      else if (v === 'team.dark') out.push(ramp[2]);
      else out.push(v);
    }
  }
  return out;
}

/** RGBA bytes for a grid, ready for ImageData. */
export function gridToRGBA(grid: Grid, legend: Record<string, LegendValue> = {}, opts: PixelOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  const idx = gridToIndices(grid, legend, opts.team);
  const out = new Uint8ClampedArray(new ArrayBuffer(idx.length * 4));
  idx.forEach((p, i) => {
    if (p < 0) return;
    const c = PALETTE_RGB[opts.dim ? DIM_MAP[p] : p];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  });
  return out;
}

/** Rotates a grid clockwise by 90 degrees `times` times. */
export function rotateGrid(grid: Grid, times = 1): Grid {
  let g = grid;
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) {
    const h = g.length;
    const w = g[0].length;
    const next: string[] = [];
    for (let x = 0; x < w; x++) {
      let row = '';
      for (let y = h - 1; y >= 0; y--) row += g[y][x];
      next.push(row);
    }
    g = next;
  }
  return g;
}
