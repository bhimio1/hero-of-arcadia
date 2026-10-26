import Phaser from 'phaser';
import { bakeAllSprites, bakeSolid } from '../gfx/bake';
import { bakeFont, loadFontFace } from '../gfx/font';

/** Bakes the font and all sprite textures, then hands over to the first real scene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    await loadFontFace();
    bakeFont(this);
    bakeAllSprites(this);
    bakeSolid(this);
    // Until the AI exists both armies are commanded from this keyboard (hot-seat).
    this.scene.start('Battle', {
      setup: {
        mapId: 'greenvale',
        seed: Date.now(),
        players: [
          { faction: 'cobalt', controller: 'human' },
          { faction: 'ember', controller: 'human' },
        ],
      },
    });
  }
}
