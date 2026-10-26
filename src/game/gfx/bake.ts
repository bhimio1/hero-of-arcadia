// Turns the JSON pixel grids into Phaser textures and animations at boot.
//
// Texture keys:
//   units/<id>      -> "units/<id>:<team>" and "units/<id>:<team>:dim"   (frames "<anim><i>")
//   buildings/<id>  -> same as units
//   terrain/<id>    -> "terrain/<id>"  (frames "<anim><i>" and rotated "<anim><i>@<1..3>")
//   ui/<id>         -> "ui/<id>"
// Animations use the texture key plus "/<anim>", e.g. "units/pikeman:cobalt/idle".

import Phaser from 'phaser';
import { SPRITE_OVERRIDES, SPRITES, gridSize, gridToRGBA, rotateGrid, type Grid, type SpriteFile } from './spriteData';
import { PALETTE_RGB, TEAM_IDS, TEAM_RAMPS } from './palette';
import { BUILDINGS, UNITS } from '../../core/data';

interface FrameSpec {
  name: string;
  grid: Grid;
}

function bakeTexture(scene: Phaser.Scene, key: string, file: SpriteFile, frames: FrameSpec[], team?: string, dim = false): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const sizes = frames.map((f) => gridSize(f.grid));
  const width = sizes.reduce((s, z) => s + z.w + 1, 0);
  const height = Math.max(...sizes.map((z) => z.h));
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) throw new Error(`could not create texture ${key}`);
  const ctx = tex.getContext();
  let x = 0;
  frames.forEach((f, i) => {
    const { w, h } = sizes[i];
    const data = gridToRGBA(f.grid, file.legend, { team, dim });
    ctx.putImageData(new ImageData(data, w, h), x, 0);
    tex.add(f.name, 0, x, 0, w, h);
    x += w + 1; // 1px gutter avoids bleeding between frames
  });
  tex.refresh();
}

function framesOf(file: SpriteFile, rotations: boolean): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const [anim, grids] of Object.entries(file.frames)) {
    grids.forEach((grid, i) => {
      out.push({ name: `${anim}${i}`, grid });
      if (rotations && grid.length === grid[0].length) {
        for (let r = 1; r < 4; r++) out.push({ name: `${anim}${i}@${r}`, grid: rotateGrid(grid, r) });
      }
    });
  }
  return out;
}

function makeAnims(scene: Phaser.Scene, key: string, file: SpriteFile): void {
  for (const [anim, grids] of Object.entries(file.frames)) {
    const animKey = `${key}/${anim}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: grids.map((_, i) => ({ key, frame: `${anim}${i}` })),
      frameRate: file.fps ?? 2,
      repeat: anim === 'idle' || anim === 'default' ? -1 : 0,
    });
  }
}

/** Texture key the loader uses for a sprite's PNG override. */
export function overrideKey(path: string): string {
  return `override:${path}`;
}

/** Queues every PNG listed in overrides.json; call from a scene's preload(). */
export function preloadOverrides(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(SPRITE_OVERRIDES)) scene.load.image(overrideKey(path), url);
}

/**
 * Bakes a hand-drawn PNG strip in place of a grid sprite (units and buildings). Pixels painted in the Cobalt
 * ramp are swapped for the team's ramp; "dim" variants are darkened by 40%.
 */
function bakeFromImage(scene: Phaser.Scene, key: string, img: HTMLImageElement, frames: FrameSpec[], team?: string, dim = false): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const sizes = frames.map((f) => gridSize(f.grid));
  const width = sizes.reduce((s, z) => s + z.w + 1, 0);
  const height = Math.max(...sizes.map((z) => z.h));
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) return;
  const ctx = tex.getContext();
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const swap = new Map<string, [number, number, number]>();
  const from = TEAM_RAMPS.cobalt;
  const to = TEAM_RAMPS[team ?? 'cobalt'] ?? from;
  from.forEach((idx, i) => swap.set(PALETTE_RGB[idx].join(','), PALETTE_RGB[to[i]]));
  let sx = 0;
  let dx = 0;
  frames.forEach((f, i) => {
    const { w, h } = sizes[i];
    const data = sctx.getImageData(sx, 0, w, h);
    for (let p = 0; p < data.data.length; p += 4) {
      const rgb = swap.get(`${data.data[p]},${data.data[p + 1]},${data.data[p + 2]}`);
      if (rgb) [data.data[p], data.data[p + 1], data.data[p + 2]] = rgb;
      if (dim) for (let c = 0; c < 3; c++) data.data[p + c] = Math.round(data.data[p + c] * 0.6);
    }
    ctx.putImageData(data, dx, 0);
    tex.add(f.name, 0, dx, 0, w, h);
    sx += w;
    dx += w + 1;
  });
  tex.refresh();
}

export function bakeAllSprites(scene: Phaser.Scene): void {
  for (const [path, file] of Object.entries(SPRITES)) {
    const folder = path.split('/')[0];
    const override = scene.textures.exists(overrideKey(path))
      ? (scene.textures.get(overrideKey(path)).getSourceImage() as HTMLImageElement)
      : null;
    if (override && (folder === 'units' || folder === 'buildings')) {
      const frames = framesOf(file, false);
      for (const team of TEAM_IDS) {
        for (const dim of [false, true]) {
          const key = `${path}:${team}${dim ? ':dim' : ''}`;
          bakeFromImage(scene, key, override, frames, team, dim);
          makeAnims(scene, key, file);
        }
      }
      continue;
    }
    if (folder === 'units' || folder === 'buildings') {
      const frames = framesOf(file, false);
      for (const team of TEAM_IDS) {
        for (const dim of [false, true]) {
          const key = `${path}:${team}${dim ? ':dim' : ''}`;
          bakeTexture(scene, key, file, frames, team, dim);
          makeAnims(scene, key, file);
        }
      }
    } else {
      const frames = framesOf(file, folder === 'terrain');
      bakeTexture(scene, path, file, frames);
      makeAnims(scene, path, file);
    }
  }
}

/** Texture key for a unit type, honouring a `sprite` field that points at another sprite. */
export function unitTextureKey(type: string, team: string, dim = false): string {
  const sprite = UNITS[type]?.sprite ?? type;
  return `units/${sprite}:${team}${dim ? ':dim' : ''}`;
}

export function buildingTextureKey(type: string, team: string, dim = false): string {
  const sprite = BUILDINGS[type]?.sprite ?? type;
  return `buildings/${sprite}:${team}${dim ? ':dim' : ''}`;
}

/** A plain 1x1 white texture used for tinted rectangles. */
export function bakeSolid(scene: Phaser.Scene): void {
  if (scene.textures.exists('solid')) return;
  const tex = scene.textures.createCanvas('solid', 1, 1);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  tex.refresh();
}

/** 16x16 checkerboard dither in one palette colour (50% coverage), two phases. */
export function bakeDither(scene: Phaser.Scene, key: string, rgb: [number, number, number]): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, 33, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(33, 16);
  for (let phase = 0; phase < 2; phase++) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if ((x + y + phase) % 2 !== 0) continue;
        const i = (y * 33 + x + phase * 17) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.add('a', 0, 0, 0, 16, 16);
  tex.add('b', 0, 17, 0, 16, 16);
  tex.refresh();
}
