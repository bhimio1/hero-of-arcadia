// Settings: sound, zoom, animation speed, grid, end-turn confirmation. Changes apply at once.

import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { setZoomSetting, type ZoomSetting } from '../display';
import { bakeDither } from '../gfx/bake';
import { PALETTE_RGB, UI } from '../gfx/palette';
import { addBackdrop } from '../render/Backdrop';
import { getSettings, updateSettings, type AnimSpeed } from '../settings';
import { bindMenuKeys, hintText, Menu, optionItem, text, textWidth, type MenuItem } from '../ui/widgets';

const VOLUMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const ZOOMS: readonly ZoomSetting[] = ['auto', 1, 2, 3, 4];
const SPEEDS: readonly AnimSpeed[] = ['normal', 'fast', 'instant'];

export class SettingsScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private from: 'Menu' | 'Battle' = 'Menu';

  constructor() {
    super('Settings');
  }

  create(data: { from: 'Menu' | 'Battle' }): void {
    this.from = data.from;
    if (data.from === 'Menu') {
      addBackdrop(this, 'first-ford');
    } else {
      bakeDither(this, 'dither-shade', PALETTE_RGB[1]);
      this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'dither-shade', 'a').setOrigin(0, 0);
    }
    const title = 'SETTINGS';
    text(this, Math.round((VIEW_W - textWidth(title) * 2) / 2), 14, title, UI.highlight).setScale(2).setScrollFactor(0).setDepth(600);
    const s = getSettings();
    const row = (i: number) => () => i;
    const items: MenuItem[] = [
      optionItem('SOUND', VOLUMES, s.volume as (typeof VOLUMES)[number], (v) => (v === 0 ? 'OFF' : `${'#'.repeat(v)}`.padEnd(10, '.')), (v) => {
        updateSettings({ volume: v });
        sfx.setVolume(v / 10);
        sfx.play('select');
      }, () => this.menu, row(0)),
      optionItem('ZOOM', ZOOMS, s.zoom, (v) => (v === 'auto' ? 'AUTO' : `${v}X`), (v) => {
        updateSettings({ zoom: v });
        setZoomSetting(this.game, v);
      }, () => this.menu, row(1)),
      optionItem('ANIMATIONS', SPEEDS, s.animSpeed, (v) => v.toUpperCase(), (v) => {
        updateSettings({ animSpeed: v });
        this.game.events.emit('settings-changed');
      }, () => this.menu, row(2)),
      optionItem('MAP GRID', [false, true], s.grid, (v) => (v ? 'ON' : 'OFF'), (v) => {
        updateSettings({ grid: v });
        this.game.events.emit('settings-changed');
      }, () => this.menu, row(3)),
      optionItem('CONFIRM END TURN', [true, false], s.confirmEndTurn, (v) => (v ? 'ON' : 'OFF'), (v) => {
        updateSettings({ confirmEndTurn: v });
      }, () => this.menu, row(4)),
      { label: 'BACK', onSelect: () => this.close() },
    ];
    const m = new Menu(this, 0, 0, items, 300);
    m.setPosition(Math.round((VIEW_W - m.boxW) / 2), 48).setScrollFactor(0).setDepth(700);
    this.menu = m;
    const hint = 'LEFT/RIGHT OR CLICK TO CHANGE';
    hintText(this, 48 + m.boxH + 6, hint);
    bindMenuKeys(this, () => this.menu, () => this.close());
  }

  private close(): void {
    sfx.play('cancel');
    if (this.from === 'Battle') {
      this.scene.stop();
      this.scene.resume('Battle');
      this.scene.resume('Hud');
    } else {
      this.scene.start('Menu');
    }
  }
}
