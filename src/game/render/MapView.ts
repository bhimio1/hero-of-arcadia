// Draws the terrain layer, including simple autotiling for roads, bridges and shorelines.

import Phaser from 'phaser';
import { getTerrain } from '../../core/data';
import type { GameState } from '../../core/types';
import { TILE } from '../config';

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

export class MapView {
  readonly layer: Phaser.GameObjects.Container;
  private buildingTiles: Set<number>;

  constructor(private scene: Phaser.Scene, private state: GameState) {
    this.layer = scene.add.container(0, 0).setDepth(0);
    this.buildingTiles = new Set(state.buildings.map((b) => b.y * state.width + b.x));
    this.build();
  }

  private hasBuilding(x: number, y: number): boolean {
    const s = this.state;
    return x >= 0 && y >= 0 && x < s.width && y < s.height && this.buildingTiles.has(y * s.width + x);
  }

  private terrainId(x: number, y: number): string | null {
    const s = this.state;
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return null;
    return s.terrain[y * s.width + x];
  }

  private isWet(id: string | null): boolean {
    return id === 'water' || id === 'ford' || id === 'bridge';
  }

  private isRoadLike(id: string | null): boolean {
    return id === 'road' || id === 'bridge';
  }

  private image(x: number, y: number, key: string, frame: string): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x * TILE, y * TILE, key, frame).setOrigin(0, 0);
    this.layer.add(img);
    return img;
  }

  private animated(x: number, y: number, key: string): void {
    const spr = this.scene.add.sprite(x * TILE, y * TILE, key, 'default0').setOrigin(0, 0);
    spr.play(`${key}/default`);
    this.layer.add(spr);
  }

  private plains(x: number, y: number): void {
    this.image(x, y, 'terrain/plains', hash(x, y) % 5 === 0 ? 'variants1' : 'variants0');
  }

  private build(): void {
    const s = this.state;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const id = s.terrain[y * s.width + x];
        const def = getTerrain(id);
        if (this.hasBuilding(x, y)) {
          // buildings stand on plain ground; their sprites are drawn by BuildingLayer
          this.plains(x, y);
          continue;
        }
        switch (def.autotile) {
          case 'road': {
            this.plains(x, y);
            this.image(x, y, 'terrain/road', 'center0');
            DIRS.forEach((d, r) => {
              if (this.connectsRoad(x + d.x, y + d.y)) this.image(x, y, 'terrain/road', r === 0 ? 'arm0' : `arm0@${r}`);
            });
            break;
          }
          case 'bridge': {
            this.animated(x, y, 'terrain/water');
            this.shore(x, y);
            const horizontal = !this.isWet(this.terrainId(x - 1, y)) || !this.isWet(this.terrainId(x + 1, y)) ||
              this.terrainId(x - 1, y) === 'bridge' || this.terrainId(x + 1, y) === 'bridge';
            this.image(x, y, 'terrain/bridge', horizontal ? 'horizontal0' : 'horizontal0@1');
            break;
          }
          case 'water': {
            this.animated(x, y, `terrain/${def.sprite}`);
            this.shore(x, y);
            break;
          }
          default:
            if (def.sprite === 'plains') this.plains(x, y);
            else this.image(x, y, `terrain/${def.sprite}`, 'default0');
        }
      }
    }
  }

  /** Foam along the edges of water tiles that border land. */
  private shore(x: number, y: number): void {
    DIRS.forEach((d, r) => {
      const n = this.terrainId(x + d.x, y + d.y);
      if (n !== null && !this.isWet(n)) this.image(x, y, 'terrain/shore', r === 0 ? 'north0' : `north0@${r}`);
    });
  }

  private connectsRoad(x: number, y: number): boolean {
    return this.isRoadLike(this.terrainId(x, y)) || this.hasBuilding(x, y);
  }

  get pixelWidth(): number {
    return this.state.width * TILE;
  }

  get pixelHeight(): number {
    return this.state.height * TILE;
  }
}
