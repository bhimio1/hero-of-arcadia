// Bakes the "Press Start 2P" web font (SIL OFL 1.1) into a 1-bit bitmap font at boot.
// Browser text rendering anti-aliases glyph edges; thresholding the alpha keeps every
// pixel either fully on or fully off, so text stays crisp at any integer zoom.

import Phaser from 'phaser';
import { FONT, FONT_SIZE } from '../config';

const FIRST = 32;
const LAST = 126;
const PER_ROW = 16;

export const FONT_CHARS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => String.fromCharCode(FIRST + i)).join('');

export async function loadFontFace(): Promise<boolean> {
  try {
    await Promise.race([
      document.fonts.load(`${FONT_SIZE}px "Press Start 2P"`),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    return document.fonts.check(`${FONT_SIZE}px "Press Start 2P"`);
  } catch {
    return false;
  }
}

export function bakeFont(scene: Phaser.Scene): void {
  const cell = FONT_SIZE;
  const rows = Math.ceil(FONT_CHARS.length / PER_ROW);
  const canvas = document.createElement('canvas');
  canvas.width = PER_ROW * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.font = `${FONT_SIZE}px "Press Start 2P", monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  [...FONT_CHARS].forEach((ch, i) => {
    ctx.fillText(ch, (i % PER_ROW) * cell, Math.floor(i / PER_ROW) * cell);
  });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] >= 128;
    img.data[i] = 255;
    img.data[i + 1] = 255;
    img.data[i + 2] = 255;
    img.data[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  const key = `${FONT}-src`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: key,
    width: cell,
    height: cell,
    chars: FONT_CHARS,
    charsPerRow: PER_ROW,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 2,
  });
  scene.cache.bitmapFont.add(FONT, data);
}
