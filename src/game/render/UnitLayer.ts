// Unit sprites: team-coloured idle animations, HP numbers, and move/attack animations.

import Phaser from 'phaser';
import { getUnitDef } from '../../core/data';
import type { Coord, GameState, Unit } from '../../core/types';
import { TILE } from '../config';
import { unitTextureKey } from '../gfx/bake';

export const DEPTH_UNITS = 100;

export interface AnimSpeed {
  /** Milliseconds per tile when walking. */
  step: number;
  /** Scale factor for attack/death timings (0 = instant). */
  fx: number;
}

class UnitSprite extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Sprite;
  hp: Phaser.GameObjects.Image;
  team = '';
  unitType = '';
  dim = false;
  facingLeft = false;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.sprite = scene.add.sprite(8, 8, '__DEFAULT');
    this.hp = scene.add.image(11, 9, 'ui/digits', 'd0').setOrigin(0, 0);
    this.add([this.sprite, this.hp]);
    scene.add.existing(this);
  }

  apply(unit: Unit, team: string, facingLeft: boolean): void {
    const dim = unit.acted;
    if (this.team !== team || this.unitType !== unit.type || this.dim !== dim) {
      this.team = team;
      this.unitType = unit.type;
      this.dim = dim;
      const key = unitTextureKey(unit.type, team, dim);
      // keep the idle animation phase so units bob in sync
      const progress = this.sprite.anims.isPlaying ? this.sprite.anims.getProgress() : 0;
      this.sprite.play(`${key}/idle`);
      this.sprite.anims.setProgress(progress);
    }
    this.sprite.setFlipX(facingLeft);
    const max = getUnitDef(unit.type).maxHp;
    const shown = Math.ceil(unit.hp);
    this.hp.setVisible(unit.hp < max);
    if (shown < 10) this.hp.setFrame(`d${Math.max(0, shown)}`);
  }
}

export class UnitLayer {
  private sprites = new Map<number, UnitSprite>();
  speed: AnimSpeed = { step: 70, fx: 1 };

  constructor(private scene: Phaser.Scene, private teamOf: (owner: number) => string) {}

  private defaultFacingLeft(owner: number): boolean {
    return owner % 2 === 1;
  }

  /** Brings sprites in line with the state (creates, removes and repositions). */
  sync(state: GameState, visible?: (u: Unit) => boolean): void {
    const seen = new Set<number>();
    for (const u of state.units) {
      if (visible && !visible(u)) continue;
      seen.add(u.id);
      let s = this.sprites.get(u.id);
      if (!s) {
        s = new UnitSprite(this.scene);
        s.facingLeft = this.defaultFacingLeft(u.owner);
        this.sprites.set(u.id, s);
      }
      s.setPosition(u.x * TILE, u.y * TILE);
      s.setDepth(DEPTH_UNITS + u.y);
      s.apply(u, this.teamOf(u.owner), s.facingLeft);
      s.setVisible(true);
      s.setAlpha(1);
    }
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    }
  }

  get(id: number): UnitSprite | undefined {
    return this.sprites.get(id);
  }

  /** Makes sure a sprite exists for `unit`, placed at `at` (used to animate units leaving the fog). */
  ensure(unit: Unit, at: Coord): void {
    if (this.sprites.has(unit.id)) return;
    const s = new UnitSprite(this.scene);
    s.facingLeft = this.defaultFacingLeft(unit.owner);
    s.setPosition(at.x * TILE, at.y * TILE);
    s.setDepth(DEPTH_UNITS + at.y);
    s.apply(unit, this.teamOf(unit.owner), s.facingLeft);
    this.sprites.set(unit.id, s);
  }

  /** Walks a unit along a path, one tile at a time. */
  async moveAlong(id: number, path: Coord[], onStep?: (c: Coord) => void, visibleAt?: (c: Coord) => boolean): Promise<void> {
    const s = this.sprites.get(id);
    if (!s || path.length < 2) return;
    if (visibleAt) s.setVisible(visibleAt(path[0]));
    for (let i = 1; i < path.length; i++) {
      const c = path[i];
      const prev = path[i - 1];
      if (c.x !== prev.x) {
        s.facingLeft = c.x < prev.x;
        s.sprite.setFlipX(s.facingLeft);
      }
      s.setDepth(DEPTH_UNITS + c.y);
      if (this.speed.step > 0) {
        await tween(this.scene, { targets: s, x: c.x * TILE, y: c.y * TILE, duration: this.speed.step });
      }
      s.setPosition(c.x * TILE, c.y * TILE);
      if (visibleAt) s.setVisible(visibleAt(c));
      if (s.visible) onStep?.(c);
    }
  }

  /** Lunge toward a target tile using the attack frame, then return. */
  async lunge(id: number, target: Coord): Promise<void> {
    const s = this.sprites.get(id);
    if (!s || this.speed.fx === 0) return;
    const ox = s.x;
    const oy = s.y;
    const dx = Math.sign(target.x * TILE - ox);
    const dy = Math.sign(target.y * TILE - oy);
    if (dx !== 0) s.sprite.setFlipX(dx < 0);
    const key = unitTextureKey(s.unitType, s.team, s.dim);
    s.sprite.stop();
    s.sprite.setTexture(key, 'attack0');
    await tween(this.scene, { targets: s, x: ox + dx * 4, y: oy + dy * 4, duration: 90 * this.speed.fx, ease: 'Stepped', easeParams: [3] });
    await wait(this.scene, 160 * this.speed.fx);
    await tween(this.scene, { targets: s, x: ox, y: oy, duration: 90 * this.speed.fx });
    s.sprite.play(`${key}/idle`);
    s.sprite.setFlipX(s.facingLeft);
  }

  /** Blink a unit to show it took damage. */
  async hit(id: number): Promise<void> {
    const s = this.sprites.get(id);
    if (!s || this.speed.fx === 0) return;
    for (let i = 0; i < 3; i++) {
      s.sprite.setVisible(false);
      await wait(this.scene, 50 * this.speed.fx);
      s.sprite.setVisible(true);
      await wait(this.scene, 50 * this.speed.fx);
    }
  }

  /** Flicker out and remove. */
  async die(id: number): Promise<void> {
    const s = this.sprites.get(id);
    if (!s) return;
    if (this.speed.fx > 0) {
      for (let i = 0; i < 6; i++) {
        s.setVisible(i % 2 === 1);
        await wait(this.scene, 60 * this.speed.fx);
      }
    }
    s.destroy();
    this.sprites.delete(id);
  }

  clear(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}

export function tween(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => scene.time.delayedCall(ms, () => resolve()));
}
