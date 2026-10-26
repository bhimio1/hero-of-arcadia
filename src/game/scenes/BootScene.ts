import Phaser from 'phaser';
import { bakeAllSprites, bakeSolid, preloadOverrides } from '../gfx/bake';
import { bakeFont, loadFontFace } from '../gfx/font';
import { sfx } from '../audio/sfx';
import { setZoomSetting } from '../display';
import { getSettings } from '../settings';

/** Bakes the font and all sprite textures, then hands over to the first real scene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // hand-drawn replacements for the built-in pixel grids, if any are configured
    preloadOverrides(this);
  }

  async create(): Promise<void> {
    await loadFontFace();
    bakeFont(this);
    bakeAllSprites(this);
    bakeSolid(this);
    const settings = getSettings();
    sfx.setVolume(settings.volume / 10);
    setZoomSetting(this.game, settings.zoom);
    this.scene.start('Menu');
  }
}
