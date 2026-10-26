// Building sprites (team-coloured, neutral grey when unowned) and capture-progress pips.

import Phaser from 'phaser';
import { getBuildingDef } from '../../core/data';
import type { Building, GameState } from '../../core/types';
import { TILE } from '../config';
import { buildingTextureKey } from '../gfx/bake';
import { pal, UI } from '../gfx/palette';

export const DEPTH_BUILDINGS = 40;

interface Entry {
  sprite: Phaser.GameObjects.Sprite;
  pips: Phaser.GameObjects.Graphics;
  team: string;
}

export class BuildingLayer {
  private entries = new Map<number, Entry>();

  constructor(private scene: Phaser.Scene, private teamOf: (owner: number) => string) {}

  sync(state: GameState): void {
    for (const b of state.buildings) {
      let e = this.entries.get(b.id);
      if (!e) {
        const sprite = this.scene.add.sprite(b.x * TILE, b.y * TILE, '__DEFAULT').setOrigin(0, 0).setDepth(DEPTH_BUILDINGS);
        const pips = this.scene.add.graphics().setDepth(890); // above units so progress stays visible
        e = { sprite, pips, team: '' };
        this.entries.set(b.id, e);
      }
      const team = b.owner === null ? 'neutral' : this.teamOf(b.owner);
      if (team !== e.team) {
        e.team = team;
        e.sprite.play(`${buildingTextureKey(b.type, team)}/idle`);
      }
      this.drawPips(e.pips, b);
    }
  }

  private drawPips(g: Phaser.GameObjects.Graphics, b: Building): void {
    g.clear();
    if (!b.capture) return;
    const required = getBuildingDef(b.type).capturePoints;
    const x0 = b.x * TILE + Math.round((TILE - (required * 3 - 1)) / 2);
    const y0 = b.y * TILE + TILE - 4;
    g.fillStyle(pal(UI.ink));
    g.fillRect(x0 - 1, y0 - 1, required * 3 + 1, 4);
    for (let i = 0; i < required; i++) {
      g.fillStyle(pal(i < b.capture.points ? UI.highlight : 25));
      g.fillRect(x0 + i * 3, y0, 2, 2);
    }
  }

  /** Brief flash when a building changes hands. */
  flash(id: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.scene.tweens.add({ targets: e.sprite, alpha: { from: 0.2, to: 1 }, duration: 90, repeat: 3, ease: 'Stepped' });
  }
}
