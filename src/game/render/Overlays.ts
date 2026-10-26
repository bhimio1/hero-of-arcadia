// Tile highlights (dithered, palette-only), the movement path preview and the blinking cursor.

import Phaser from 'phaser';
import type { Coord } from '../../core/types';
import { TILE } from '../config';
import { bakeDither } from '../gfx/bake';
import { PALETTE_RGB, UI } from '../gfx/palette';

export type HighlightKind = 'move' | 'attack' | 'danger' | 'target';

const COLORS: Record<HighlightKind, number> = {
  move: UI.move,
  attack: UI.attack,
  danger: UI.danger,
  target: UI.highlight,
};

export class Overlays {
  private groups: Record<HighlightKind, Phaser.GameObjects.Image[]> = { move: [], attack: [], danger: [], target: [] };
  private path: Phaser.GameObjects.Image[] = [];
  readonly cursor: Phaser.GameObjects.Sprite;
  private phase = 0;

  constructor(private scene: Phaser.Scene) {
    for (const [kind, color] of Object.entries(COLORS)) bakeDither(scene, `dither-${kind}`, PALETTE_RGB[color]);
    this.cursor = scene.add.sprite(0, 0, 'ui/cursor', 'default0').setOrigin(0, 0).setDepth(900);
    this.cursor.play('ui/cursor/default');
    scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        this.phase ^= 1;
        for (const list of Object.values(this.groups)) for (const img of list) img.setFrame(this.phase ? 'b' : 'a');
      },
    });
  }

  show(kind: HighlightKind, tiles: Coord[]): void {
    this.clear(kind);
    const depth = kind === 'move' ? 50 : kind === 'danger' ? 49 : 51;
    for (const t of tiles) {
      const img = this.scene.add.image(t.x * TILE, t.y * TILE, `dither-${kind}`, this.phase ? 'b' : 'a').setOrigin(0, 0).setDepth(depth);
      this.groups[kind].push(img);
    }
  }

  clear(kind?: HighlightKind): void {
    const kinds = kind ? [kind] : (Object.keys(this.groups) as HighlightKind[]);
    for (const k of kinds) {
      for (const img of this.groups[k]) img.destroy();
      this.groups[k] = [];
    }
    if (!kind) this.showPath([]);
  }

  has(kind: HighlightKind): boolean {
    return this.groups[kind].length > 0;
  }

  showPath(path: Coord[]): void {
    for (const d of this.path) d.destroy();
    this.path = [];
    for (let i = 1; i < path.length; i++) {
      const c = path[i];
      const dot = this.scene.add.image(c.x * TILE + 6, c.y * TILE + 6, 'ui/pathdot', 'default0').setOrigin(0, 0).setDepth(60);
      this.path.push(dot);
      // a second dot between tiles makes the route easier to read
      const p = path[i - 1];
      const mid = this.scene.add
        .image(((p.x + c.x) / 2) * TILE + 6, ((p.y + c.y) / 2) * TILE + 6, 'ui/pathdot', 'default0')
        .setOrigin(0, 0)
        .setDepth(60);
      this.path.push(mid);
    }
  }

  moveCursor(c: Coord): void {
    this.cursor.setPosition(c.x * TILE, c.y * TILE);
  }
}
