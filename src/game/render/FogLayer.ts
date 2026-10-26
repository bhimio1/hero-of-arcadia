// Fog of war overlay: a dark dither over every tile the viewing player cannot see.

import Phaser from 'phaser';
import { TILE } from '../config';
import { bakeDither } from '../gfx/bake';
import { PALETTE_RGB } from '../gfx/palette';

export const DEPTH_FOG = 95;

export class FogLayer {
  private tiles: (Phaser.GameObjects.Image | null)[];

  constructor(private scene: Phaser.Scene, private width: number, height: number) {
    bakeDither(scene, 'dither-fog', PALETTE_RGB[1]);
    this.tiles = new Array(width * height).fill(null);
  }

  /** `mask[i]` true = visible. Pass null to clear the fog entirely. */
  update(mask: boolean[] | null): void {
    for (let i = 0; i < this.tiles.length; i++) {
      const fogged = !!mask && !mask[i];
      let img = this.tiles[i];
      if (fogged && !img) {
        const x = (i % this.width) * TILE;
        const y = Math.floor(i / this.width) * TILE;
        img = this.scene.add.image(x, y, 'dither-fog', 'a').setOrigin(0, 0).setDepth(DEPTH_FOG);
        this.tiles[i] = img;
      }
      img?.setVisible(fogged);
    }
  }
}
