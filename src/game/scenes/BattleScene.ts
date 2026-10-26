// The battle: map, units, selection, orders and turn flow. Rules live in src/core; this
// scene only turns input into core actions and plays back the resulting events.

import Phaser from 'phaser';
import { targetsFrom, threatTiles } from '../../core/combat';
import { getFaction, getUnitDef } from '../../core/data';
import { dispatch, newMatch, type Match } from '../../core/match';
import { computeReach, destinations, pathTo, type Reach } from '../../core/pathfinding';
import { getUnit, terrainAt, unitAt, type GameSetup } from '../../core/state';
import type { Action, Coord, GameEvent, Unit } from '../../core/types';
import { TILE, VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { bakeDither } from '../gfx/bake';
import { pal, PALETTE_RGB, UI } from '../gfx/palette';
import { MapView } from '../render/MapView';
import { Overlays } from '../render/Overlays';
import { tween, UnitLayer, wait } from '../render/UnitLayer';
import { shadowText } from '../ui/widgets';
import type { MenuItem } from '../ui/widgets';
import type { GameOverData } from './GameOverScene';
import type { HudScene } from './HudScene';

type Mode = 'idle' | 'selected' | 'menu' | 'targeting' | 'busy' | 'over';

const PAN_SPEED = 220; // px per second
const DRAG_THRESHOLD = 4;
const MARGIN = 24;

interface Selection {
  unit: Unit;
  reach: Reach;
  dests: Coord[];
}

export interface BattleInit {
  setup: GameSetup;
}

export class BattleScene extends Phaser.Scene {
  private match!: Match;
  private initData!: BattleInit;
  private mapView!: MapView;
  private units!: UnitLayer;
  private overlays!: Overlays;
  private hud!: HudScene;
  private mode: Mode = 'idle';
  private selected: Selection | null = null;
  private hover: Coord = { x: 0, y: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private drag: { startX: number; startY: number; scrollX: number; scrollY: number; active: boolean } | null = null;
  private inspected: number | null = null;

  constructor() {
    super('Battle');
  }

  init(data: BattleInit): void {
    this.initData = data;
    this.match = newMatch(data.setup);
    this.mode = 'idle';
    this.selected = null;
    this.inspected = null;
  }

  create(): void {
    const state = this.match.state;
    this.cameras.main.setBackgroundColor(pal(1));
    bakeDither(this, 'dither-shade', PALETTE_RGB[1]);
    this.mapView = new MapView(this, state);
    this.units = new UnitLayer(this, (owner) => this.match.state.players[owner].faction);
    this.overlays = new Overlays(this);
    this.units.sync(state);

    this.scene.launch('Hud', { callbacks: { onEndTurn: () => this.requestEndTurn() } });
    this.hud = this.scene.get('Hud') as HudScene;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop('Hud');
      this.scene.stop('GameOver');
    });

    this.setupInput();
    this.centerCameraOn(this.firstReadyUnit() ?? { x: 0, y: 0 });
    this.mode = 'busy';
    // the HUD scene finishes its create() on the next tick
    this.time.delayedCall(0, () => void this.beginTurn());
  }

  // ---------------------------------------------------------------------------
  // Input

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');
    kb.on('keydown', () => sfx.unlock());
    kb.on('keydown-ESC', () => this.cancel());
    kb.on('keydown-SPACE', () => {
      if (this.mode === 'idle' && !this.hud.menuOpen) this.requestEndTurn();
    });
    kb.on('keydown-TAB', () => this.selectNextUnit());

    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      if (p.rightButtonDown()) {
        this.cancel();
        return;
      }
      if (this.hud.isOverUI(p.x, p.y)) return;
      const cam = this.cameras.main;
      this.drag = { startX: p.x, startY: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, active: false };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const drag = this.drag;
      this.drag = null;
      if (p.button !== 0 || !drag || drag.active) return;
      if (this.hud.isOverUI(p.x, p.y)) return;
      this.onTileClick(this.pointerTile(p));
    });
  }

  private pointerTile(p: Phaser.Input.Pointer): Coord {
    const cam = this.cameras.main;
    return { x: Math.floor((p.x + cam.scrollX) / TILE), y: Math.floor((p.y + cam.scrollY) / TILE) };
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.drag && p.isDown) {
      const dx = p.x - this.drag.startX;
      const dy = p.y - this.drag.startY;
      if (!this.drag.active && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this.drag.active = true;
      if (this.drag.active) {
        this.cameras.main.setScroll(this.drag.scrollX - dx, this.drag.scrollY - dy);
        this.clampCamera();
      }
    }
    this.hud.setCursorScreen(p.x, p.y);
    const t = this.pointerTile(p);
    if (this.inside(t)) this.setHover(t);
  }

  private inside(c: Coord): boolean {
    const s = this.match.state;
    return c.x >= 0 && c.y >= 0 && c.x < s.width && c.y < s.height;
  }

  private setHover(t: Coord): void {
    if (t.x === this.hover.x && t.y === this.hover.y) return;
    this.hover = t;
    this.overlays.moveCursor(t);
    if (this.mode === 'selected' && this.selected) {
      const isDest = this.selected.dests.some((d) => d.x === t.x && d.y === t.y);
      this.overlays.showPath(isDest ? (pathTo(this.selected.reach, t) ?? []) : []);
    }
    this.refreshInfo();
  }

  override update(_time: number, delta: number): void {
    if (this.hud?.menuOpen) return;
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (k.LEFT.isDown || k.A.isDown) dx -= 1;
    if (k.RIGHT.isDown || k.D.isDown) dx += 1;
    if (k.UP.isDown || k.W.isDown) dy -= 1;
    if (k.DOWN.isDown || k.S.isDown) dy += 1;
    if (dx || dy) {
      const cam = this.cameras.main;
      const step = (PAN_SPEED * delta) / 1000;
      cam.setScroll(cam.scrollX + dx * step, cam.scrollY + dy * step);
      this.clampCamera();
    }
  }

  private clampCamera(): void {
    const cam = this.cameras.main;
    const w = this.mapView.pixelWidth;
    const h = this.mapView.pixelHeight;
    const clampAxis = (scroll: number, size: number, view: number) => {
      if (size + MARGIN * 2 <= view) return Math.round((size - view) / 2);
      return Math.round(Phaser.Math.Clamp(scroll, -MARGIN, size + MARGIN - view));
    };
    cam.scrollX = clampAxis(cam.scrollX, w, VIEW_W);
    cam.scrollY = clampAxis(cam.scrollY, h, VIEW_H);
  }

  private centerCameraOn(c: Coord): void {
    this.cameras.main.centerOn(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2);
    this.clampCamera();
  }

  /** Pans smoothly so that a tile is comfortably on screen. */
  private async ensureVisible(c: Coord): Promise<void> {
    const cam = this.cameras.main;
    const px = c.x * TILE;
    const py = c.y * TILE;
    const pad = 48;
    if (px >= cam.scrollX + pad && px + TILE <= cam.scrollX + VIEW_W - pad && py >= cam.scrollY + pad && py + TILE <= cam.scrollY + VIEW_H - pad) return;
    const fromX = cam.scrollX;
    const fromY = cam.scrollY;
    this.centerCameraOn(c);
    const toX = cam.scrollX;
    const toY = cam.scrollY;
    cam.setScroll(fromX, fromY);
    const proxy = { t: 0 };
    await tween(this, {
      targets: proxy,
      t: 1,
      duration: 250,
      ease: 'Cubic.easeInOut',
      onUpdate: () => cam.setScroll(Math.round(fromX + (toX - fromX) * proxy.t), Math.round(fromY + (toY - fromY) * proxy.t)),
    });
  }

  private screenOf(c: Coord): { x: number; y: number } {
    const cam = this.cameras.main;
    return { x: c.x * TILE - cam.scrollX, y: c.y * TILE - cam.scrollY };
  }

  // ---------------------------------------------------------------------------
  // Selection and orders

  private get state() {
    return this.match.state;
  }

  private isReady(u: Unit | undefined): boolean {
    return !!u && u.owner === this.state.currentPlayer && !u.acted && !u.moved;
  }

  private onTileClick(t: Coord): void {
    if (!this.inside(t)) return;
    const unit = unitAt(this.state, t.x, t.y);
    switch (this.mode) {
      case 'idle':
        if (unit && this.isReady(unit)) {
          this.select(unit);
        } else if (unit && unit.owner !== this.state.currentPlayer) {
          this.toggleInspect(unit);
        } else {
          this.clearInspect();
        }
        break;
      case 'selected': {
        const sel = this.selected!;
        if (unit && unit.id === sel.unit.id) {
          sfx.play('select');
          this.openActionMenu();
          return;
        }
        if (sel.dests.some((d) => d.x === t.x && d.y === t.y)) {
          const path = pathTo(sel.reach, t);
          if (path) void this.orderMove(path);
          return;
        }
        this.deselect();
        sfx.play('cancel');
        if (unit && this.isReady(unit)) this.select(unit);
        break;
      }
      case 'targeting': {
        const sel = this.selected!;
        const targets = targetsFrom(this.state, sel.unit, sel.unit);
        const target = targets.find((u) => u.x === t.x && u.y === t.y);
        if (target) void this.orderAttack(target);
        else this.backToMenu();
        break;
      }
      default:
        break;
    }
  }

  private toggleInspect(unit: Unit): void {
    if (this.inspected === unit.id) {
      this.clearInspect();
      return;
    }
    this.inspected = unit.id;
    const reach = computeReach(this.state, unit);
    const dests = destinations(this.state, unit, reach);
    this.overlays.show('danger', threatTiles(this.state, unit, dests));
    sfx.play('select');
  }

  private clearInspect(): void {
    if (this.inspected === null) return;
    this.inspected = null;
    this.overlays.clear('danger');
  }

  private select(unit: Unit): void {
    this.clearInspect();
    const reach = computeReach(this.state, unit);
    const dests = destinations(this.state, unit, reach);
    this.selected = { unit, reach, dests };
    this.mode = 'selected';
    this.overlays.show('move', dests);
    const destSet = new Set(dests.map((d) => d.y * this.state.width + d.x));
    this.overlays.show('attack', threatTiles(this.state, unit, dests).filter((c) => !destSet.has(c.y * this.state.width + c.x)));
    sfx.play('select');
  }

  private deselect(): void {
    this.selected = null;
    this.mode = 'idle';
    this.overlays.clear();
    this.hud.closeMenu();
  }

  private cancel(): void {
    if (this.hud.menuOpen && this.mode === 'idle') {
      this.hud.closeDialog();
      this.hud.closeMenu();
      sfx.play('cancel');
      return;
    }
    switch (this.mode) {
      case 'selected':
        this.deselect();
        sfx.play('cancel');
        break;
      case 'menu':
        if (!this.selected!.unit.moved) {
          this.hud.closeMenu();
          this.select(this.selected!.unit);
          sfx.play('cancel');
        }
        break;
      case 'targeting':
        this.backToMenu();
        break;
      case 'idle':
        this.clearInspect();
        break;
      default:
        break;
    }
  }

  private async orderMove(path: Coord[]): Promise<void> {
    const sel = this.selected!;
    this.overlays.clear();
    this.mode = 'busy';
    await this.perform({ type: 'move', unitId: sel.unit.id, path });
    const moved = getUnit(this.state, sel.unit.id);
    if (!moved) {
      this.mode = 'idle';
      return;
    }
    this.selected = { ...sel, unit: moved };
    this.openActionMenu();
  }

  private openActionMenu(): void {
    const sel = this.selected!;
    const unit = getUnit(this.state, sel.unit.id)!;
    this.selected = { ...sel, unit };
    this.overlays.clear();
    this.mode = 'menu';
    const def = getUnitDef(unit.type);
    const targets = targetsFrom(this.state, unit, unit);
    const canFire = !unit.moved || def.moveAndFire;
    const items: MenuItem[] = [];
    if (targets.length > 0 && canFire) {
      items.push({ label: 'ATTACK', onSelect: () => this.startTargeting() });
    }
    items.push({ label: 'WAIT', onSelect: () => void this.orderWait() });
    const s = this.screenOf(unit);
    this.hud.openMenu(items, s.x + TILE + 4, s.y - 4);
    this.overlays.moveCursor(unit);
  }

  private backToMenu(): void {
    sfx.play('cancel');
    this.openActionMenu();
  }

  private startTargeting(): void {
    const unit = this.selected!.unit;
    this.hud.closeMenu();
    this.mode = 'targeting';
    sfx.play('confirm');
    const targets = targetsFrom(this.state, unit, unit);
    this.overlays.show('target', targets.map((u) => ({ x: u.x, y: u.y })));
    const def = getUnitDef(unit.type);
    this.overlays.show('attack', threatTiles(this.state, unit, [unit]).filter(() => def.range[1] > 0));
  }

  private async orderAttack(target: Unit): Promise<void> {
    const unit = this.selected!.unit;
    this.overlays.clear();
    this.mode = 'busy';
    sfx.play('confirm');
    await this.perform({ type: 'attack', unitId: unit.id, targetId: target.id });
    this.afterOrder();
  }

  private async orderWait(): Promise<void> {
    const unit = this.selected!.unit;
    this.hud.closeMenu();
    this.mode = 'busy';
    sfx.play('confirm');
    await this.perform({ type: 'wait', unitId: unit.id });
    this.afterOrder();
  }

  private afterOrder(): void {
    this.selected = null;
    this.overlays.clear();
    if (this.state.gameOver) return;
    this.mode = 'idle';
    this.refreshInfo();
  }

  private selectNextUnit(): void {
    if (this.mode !== 'idle' && this.mode !== 'selected') return;
    const ready = this.state.units.filter((u) => this.isReady(u));
    if (ready.length === 0) return;
    const currentId = this.selected?.unit.id ?? -1;
    const idx = ready.findIndex((u) => u.id === currentId);
    const next = ready[(idx + 1) % ready.length];
    this.deselect();
    this.select(next);
    this.centerCameraOn(next);
    this.hover = { x: -1, y: -1 };
    this.setHover({ x: next.x, y: next.y });
  }

  private requestEndTurn(): void {
    if (this.mode === 'selected') this.deselect();
    if (this.mode !== 'idle') return;
    const ready = this.state.units.filter((u) => this.isReady(u)).length;
    if (ready === 0) {
      void this.endTurn();
      return;
    }
    sfx.play('select');
    this.hud.dialogBox([`${ready} UNIT${ready > 1 ? 'S' : ''} CAN STILL ACT.`, 'END TURN?'], [
      { label: 'END TURN', onSelect: () => void this.endTurn() },
      { label: 'CANCEL', onSelect: () => sfx.play('cancel') },
    ]);
  }

  private async endTurn(): Promise<void> {
    if (this.mode !== 'idle') return;
    this.clearInspect();
    this.mode = 'busy';
    sfx.play('endTurn');
    await this.perform({ type: 'endTurn' });
  }

  /** Banner and camera for the player whose turn just started. */
  private async beginTurn(): Promise<void> {
    if (this.state.gameOver) return;
    this.mode = 'busy';
    this.refreshHud();
    const p = this.state.players[this.state.currentPlayer];
    const first = this.firstReadyUnit();
    if (first) void this.ensureVisible(first);
    sfx.play('turnStart');
    await this.hud.banner(`DAY ${this.state.round}`, p.faction, getFaction(p.faction).name.toUpperCase());
    this.mode = 'idle';
  }

  // ---------------------------------------------------------------------------
  // Applying actions and animating events

  private async perform(action: Action): Promise<boolean> {
    const res = dispatch(this.match, action);
    if (!res.ok) {
      console.warn('rejected action', action, res.error);
      sfx.play('error');
      return false;
    }
    this.hud.setButtonsEnabled(false);
    for (const ev of res.events) await this.animate(ev);
    this.units.sync(this.state);
    this.hud.setButtonsEnabled(true);
    this.refreshHud();
    return true;
  }

  private async animate(ev: GameEvent): Promise<void> {
    switch (ev.type) {
      case 'moved':
        await this.units.moveAlong(ev.unitId, ev.path, () => sfx.play('step'));
        break;
      case 'attacked': {
        const attacker = this.unitPos(ev.attackerId);
        const defender = this.unitPos(ev.defenderId);
        if (attacker && defender) {
          sfx.play('attack');
          await this.units.lunge(ev.attackerId, defender);
          sfx.play('hit');
          void this.popup(defender, `-${ev.damage}`, ev.counter ? UI.danger : UI.bad);
          await this.units.hit(ev.defenderId);
        }
        break;
      }
      case 'died':
        sfx.play('death');
        await this.units.die(ev.unitId);
        break;
      case 'turnStarted':
        await this.beginTurn();
        break;
      case 'gameOver':
        await this.showGameOver();
        break;
      default:
        break;
    }
  }

  /** Last known position of a unit sprite (units may already be gone from the state). */
  private unitPos(id: number): Coord | null {
    const s = this.units.get(id);
    return s ? { x: Math.round(s.x / TILE), y: Math.round(s.y / TILE) } : null;
  }

  private async popup(c: Coord, str: string, color: number): Promise<void> {
    const t = shadowText(this, c.x * TILE + 8 - str.length * 4, c.y * TILE - 2, str, color).setDepth(950);
    await tween(this, { targets: t, y: t.y - 10, duration: 300, ease: 'Cubic.easeOut' });
    await wait(this, 350);
    t.destroy();
  }

  private async showGameOver(): Promise<void> {
    this.mode = 'over';
    this.overlays.clear();
    this.hud.closeMenu();
    await wait(this, 400);
    const humans = this.state.players.map((p, i) => (p.controller === 'human' ? i : -1)).filter((i) => i >= 0);
    const data: GameOverData = {
      state: this.state,
      viewer: humans.length === 1 ? humans[0] : null,
      onRematch: () => {
        this.scene.stop('GameOver');
        this.scene.restart({ setup: { ...this.initData.setup, seed: Date.now() } });
      },
    };
    this.scene.launch('GameOver', data);
  }

  // ---------------------------------------------------------------------------
  // HUD

  private firstReadyUnit(): Unit | undefined {
    return this.state.units.find((u) => this.isReady(u));
  }

  private refreshHud(): void {
    if (!this.hud?.sys.isActive()) return;
    const p = this.state.players[this.state.currentPlayer];
    this.hud.setTurn(this.state.round, getFaction(p.faction).name, p.faction);
    this.refreshInfo();
  }

  private refreshInfo(): void {
    if (!this.hud?.sys.isActive() || !this.inside(this.hover)) return;
    const unit = unitAt(this.state, this.hover.x, this.hover.y) ?? null;
    this.hud.setInfo({
      terrain: terrainAt(this.state, this.hover.x, this.hover.y),
      unit,
      faction: unit ? this.state.players[unit.owner].faction : undefined,
    });
  }
}
