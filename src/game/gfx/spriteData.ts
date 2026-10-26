// Sprite sources: small pixel grids stored as JSON in src/data/sprites. This module only
// parses them into RGBA pixels (no Phaser), so it can be unit-tested and so the grids can
// later be replaced by hand-drawn PNGs without touching the renderer.

import legendJson from '../../data/sprites/legend.json';
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

/** All sprite files keyed by "<folder>/<id>", e.g. "units/pikeman". */
export const SPRITES: Record<string, SpriteFile> = {};
for (const [path, file] of Object.entries(modules)) {
  const m = /sprites\/(.+)\/([^/]+)\.json$/.exec(path);
  if (!m) continue; // legend.json sits at the root
  SPRITES[`${m[1]}/${m[2]}`] = file;
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
