// Whole-number scaling. The game renders at VIEW_W x VIEW_H and is enlarged by an integer
// factor *in device pixels*, so every game pixel becomes an exact square of screen pixels
// even on high-DPI screens. Whatever space is left over becomes a black letterbox.

import type Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './config';

export type ZoomSetting = 'auto' | 1 | 2 | 3 | 4 | 5 | 6;

export function maxDeviceZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / VIEW_W, (window.innerHeight * dpr) / VIEW_H)));
}

/** CSS zoom factor that maps one game pixel to an integer number of device pixels. */
export function computeZoom(setting: ZoomSetting): number {
  const dpr = window.devicePixelRatio || 1;
  const max = maxDeviceZoom();
  const device = setting === 'auto' ? max : Math.min(max, Math.max(1, Math.round(setting * dpr)));
  return device / dpr;
}

let currentSetting: ZoomSetting = 'auto';

export function setZoomSetting(game: Phaser.Game, setting: ZoomSetting): void {
  currentSetting = setting;
  game.scale.setZoom(computeZoom(setting));
}

export function installResizeHandler(game: Phaser.Game): void {
  const apply = () => game.scale.setZoom(computeZoom(currentSetting));
  window.addEventListener('resize', apply);
  // devicePixelRatio changes when the window moves between monitors or the page is zoomed.
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => {
      apply();
      watchDpr();
    }, { once: true });
  };
  watchDpr();
  apply();
}
