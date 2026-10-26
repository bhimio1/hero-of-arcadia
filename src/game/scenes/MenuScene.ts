// Title screen.

import Phaser from 'phaser';
import { GAME_TITLE, VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { pal, UI } from '../gfx/palette';
import { addBackdrop } from '../render/Backdrop';
import { saves } from '../settings';
import { bindMenuKeys, Menu, Panel, text, textWidth, type MenuItem } from '../ui/widgets';

export class MenuScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private credits: Panel | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.menu = null;
    this.credits = null;
    addBackdrop(this, 'wildwood');
    // solid band behind the title so it reads cleanly over the dithered map
    const band = this.add.graphics().setScrollFactor(0).setDepth(590);
    band.fillStyle(pal(1));
    band.fillRect(0, 22, VIEW_W, 78);
    band.fillStyle(pal(UI.highlight));
    band.fillRect(0, 22, VIEW_W, 1);
    band.fillRect(0, 99, VIEW_W, 1);
    band.fillRect(0, VIEW_H - 18, VIEW_W, 18);
    band.fillStyle(pal(1));
    band.fillRect(0, VIEW_H - 17, VIEW_W, 17);

    const [first, ...rest] = GAME_TITLE.toUpperCase().split(' ');
    const small = `${first} ${rest.slice(0, -1).join(' ')}`.trim();
    const big = rest[rest.length - 1];
    const top = text(this, 0, 30, small, UI.text).setScrollFactor(0).setDepth(600);
    top.x = Math.round((VIEW_W - textWidth(small) * 2) / 2);
    top.setScale(2);
    const bigShadow = text(this, 0, 50, big, 3).setScale(4).setScrollFactor(0).setDepth(600);
    const bigText = text(this, 0, 48, big, UI.highlight).setScale(4).setScrollFactor(0).setDepth(601);
    bigText.x = Math.round((VIEW_W - textWidth(big) * 4) / 2);
    bigShadow.x = bigText.x + 2;
    const tag = 'A TALE OF BANNERS AND RIVERS';
    text(this, Math.round((VIEW_W - textWidth(tag)) / 2), 88, tag, 20).setScrollFactor(0).setDepth(600);

    const hasAuto = (() => {
      try {
        return saves.read('auto') !== null;
      } catch {
        return false;
      }
    })();
    const items: MenuItem[] = [
      { label: 'NEW GAME', onSelect: () => this.go('NewGame') },
      { label: 'CONTINUE', enabled: hasAuto, onSelect: () => this.continueGame() },
      { label: 'LOAD GAME', onSelect: () => this.go('Saves', { mode: 'load', from: 'Menu' }) },
      { label: 'SETTINGS', onSelect: () => this.go('Settings', { from: 'Menu' }) },
      { label: 'CREDITS', onSelect: () => this.showCredits() },
    ];
    const m = new Menu(this, 0, 0, items, 136);
    m.setPosition(Math.round((VIEW_W - m.boxW) / 2), 120).setScrollFactor(0).setDepth(700);
    this.menu = m;
    if (hasAuto) m.select(1);

    const hint = 'ARROWS + ENTER OR MOUSE';
    text(this, Math.round((VIEW_W - textWidth(hint)) / 2), VIEW_H - 12, hint, UI.textDim).setScrollFactor(0).setDepth(600);
    text(this, 4, VIEW_H - 12, 'V1.0', 23).setScrollFactor(0).setDepth(600);

    bindMenuKeys(this, () => this.menu, () => this.hideCredits());
  }

  private go(scene: string, data?: object): void {
    sfx.play('confirm');
    this.scene.start(scene, data);
  }

  private continueGame(): void {
    try {
      const save = saves.read('auto');
      if (!save) return;
      sfx.play('confirm');
      this.scene.start('Battle', { save });
    } catch (e) {
      console.warn('could not load autosave', e);
      sfx.play('error');
    }
  }

  private showCredits(): void {
    sfx.play('confirm');
    const lines = [
      'HERO OF ARCADIA',
      '',
      'DESIGN, CODE AND PIXELS',
      'MADE FOR THIS PROJECT',
      '',
      'FONT: PRESS START 2P',
      'BY CODEMAN38 (SIL OFL 1.1)',
      'PALETTE: DAWNBRINGER 32',
      'ENGINE: PHASER 3',
      '',
      'PRESS ESC OR CLICK',
    ];
    const w = 260;
    const p = new Panel(this, (VIEW_W - w) / 2, 104, w, lines.length * 11 + 14).setScrollFactor(0).setDepth(800);
    lines.forEach((l, i) => p.add(text(this, Math.round((w - textWidth(l)) / 2), 8 + i * 11, l, i === 0 ? UI.highlight : UI.text)));
    this.credits = p;
    this.menu?.setVisible(false);
    const saved = this.menu;
    this.menu = null;
    this.input.once('pointerdown', () => {
      this.menu = saved;
      this.hideCredits();
    });
    this.restoreMenu = () => {
      this.menu = saved;
    };
  }

  private restoreMenu: (() => void) | null = null;

  private hideCredits(): void {
    if (!this.credits) return;
    sfx.play('cancel');
    this.credits.destroy();
    this.credits = null;
    this.restoreMenu?.();
    this.restoreMenu = null;
    this.menu?.setVisible(true);
  }
}
