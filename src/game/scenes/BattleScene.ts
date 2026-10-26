// The battle: map, units, selection and movement. Rules live in src/core; this scene only
// turns input into core actions and plays back the resulting events.

import Phaser from 'phaser';
import { getFaction } from '../../core/data';
import { dispatch, newMatch, type Match } from '../../core/match';
import { computeReach, destinations, pathTo, type Reach } from '../../core/pathfinding';
import { getUnit, terrainAt, unitAt, type GameSetup } from '../../core/state';
import type { Action, Coord, GameEvent, Unit } from '../../core/types';
import { TILE, VIEW_H, VIEW_W } from '../config';
import { pal, TEAM_RAMPS } from '../gfx/palette';
import { MapView } from '../render/MapView';
import { Overlays } from '../render/Overlays';
import { UnitLayer } from '../render/UnitLayer';
import type { HudScene } from './HudScene';

type Mode = 'idle' | 'selected' | 'busy';

const PAN_SPEED = 220; // px per second
const DRAG_THRESHOLD = 4;
const MARGIN = 24;

export class BattleScene extends Phaser.Scene {
  private match!: Match;
  private mapView!: MapView;
  private units!: UnitLayer;
  private overlays!: Overlays;
  private hud!: HudScene;
  private mode: Mode = 'idle';
  private selected: { unit: Unit; reach: Reach; dests: Coord[] } | null = null;
  private hover: Coord = { x: 0, y: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private drag: { startX: number; startY: number; scrollX: number; scrollY: number; active: boolean } | null = null;

  constructor() {
    super('Battle');
  }

  init(data: { setup: GameSetup }): void {
    this.match = newMatch(data.setup);
    this.mode = 'idle';
    this.selected = null;
  }

  create(): void {
    const state = this.match.state;
    this.cameras.main.setBackgroundColor(pal(1));
    this.mapView = new MapView(this, state);
    this.units = new UnitLayer(this, (owner) => this.match.state.players[owner].faction);
    this.overlays = new Overlays(this);
    this.units.sync(state);

    this.scene.launch('Hud', { callbacks: { onEndTurn: () => this.endTurn() } });
    this.hud = this.scene.get('Hud') as HudScene;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('Hud'));

    this.setupInput();
    this.centerCameraOn(this.firstUnitOf(state.currentPlayer) ?? { x: 0, y: 0 });
    // the HUD scene finishes its create() on the next tick
    this.time.delayedCall(0, () => this.refreshHud());
  }

  // ---------------------------------------------------------------------------
  // Input

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('TAB,SPACE');
    kb.on('keydown-ESC', () => this.cancel());
    kb.on('keydown-SPACE', () => this.endTurn());
    kb.on('keydown-TAB', () => this.selectNextUnit());

    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        this.cancel();
        return;
      }
      if (this.hud?.isOverUI(p.x, p.y)) return;
      const cam = this.cameras.main;
      this.drag = { startX: p.x, startY: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, active: false };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const drag = this.drag;
      this.drag = null;
      if (p.button !== 0 || !drag || drag.active) return;
      if (this.hud?.isOverUI(p.x, p.y)) return;
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

  // ---------------------------------------------------------------------------
  // Selection and orders

  private onTileClick(t: Coord): void {
    if (this.mode === 'busy' || !this.inside(t)) return;
    const state = this.match.state;
    const unit = unitAt(state, t.x, t.y);
    if (this.mode === 'selected' && this.selected) {
      const sel = this.selected;
      if (sel.dests.some((d) => d.x === t.x && d.y === t.y) && !(t.x === sel.unit.x && t.y === sel.unit.y)) {
        const path = pathTo(sel.reach, t);
        if (path) void this.orderMove(sel.unit, path);
        return;
      }
      this.deselect();
      if (unit && unit.id === sel.unit.id) return;
    }
    if (unit && unit.owner === state.currentPlayer && !unit.acted && !unit.moved) this.select(unit);
  }

  private select(unit: Unit): void {
    const reach = computeReach(this.match.state, unit);
    const dests = destinations(this.match.state, unit, reach);
    this.selected = { unit, reach, dests };
    this.mode = 'selected';
    this.overlays.show('move', dests);
  }

  private deselect(): void {
    this.selected = null;
    this.mode = 'idle';
    this.overlays.clear();
  }

  private cancel(): void {
    if (this.mode === 'selected') this.deselect();
  }

  private async orderMove(unit: Unit, path: Coord[]): Promise<void> {
    this.overlays.clear();
    this.selected = null;
    this.mode = 'busy';
    await this.perform({ type: 'move', unitId: unit.id, path });
    await this.perform({ type: 'wait', unitId: unit.id });
    this.mode = 'idle';
    this.refreshInfo();
  }

  private selectNextUnit(): void {
    if (this.mode === 'busy') return;
    const state = this.match.state;
    const ready = state.units.filter((u) => u.owner === state.currentPlayer && !u.acted && !u.moved);
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

  private endTurn(): void {
    if (this.mode === 'busy') return;
    this.deselect();
    void this.perform({ type: 'endTurn' }).then(() => {
      const first = this.firstUnitOf(this.match.state.currentPlayer);
      if (first) this.centerCameraOn(first);
    });
  }

  /** Applies an action and animates its events. */
  private async perform(action: Action): Promise<boolean> {
    const res = dispatch(this.match, action);
    if (!res.ok) {
      console.warn('rejected action', action, res.error);
      return false;
    }
    for (const ev of res.events) await this.animate(ev);
    this.units.sync(this.match.state);
    this.refreshHud();
    return true;
  }

  private async animate(ev: GameEvent): Promise<void> {
    switch (ev.type) {
      case 'moved':
        await this.units.moveAlong(ev.unitId, ev.path);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // HUD

  private firstUnitOf(player: number): Unit | undefined {
    return this.match.state.units.find((u) => u.owner === player);
  }

  private refreshHud(): void {
    if (!this.hud?.sys.isActive()) return;
    const state = this.match.state;
    const p = state.players[state.currentPlayer];
    this.hud.setTurn(state.round, getFaction(p.faction).short, pal(TEAM_RAMPS[p.faction][0]));
    this.refreshInfo();
  }

  private refreshInfo(): void {
    if (!this.hud?.sys.isActive()) return;
    const state = this.match.state;
    if (!this.inside(this.hover)) return;
    const unit = unitAt(state, this.hover.x, this.hover.y) ?? null;
    this.hud.setInfo(terrainAt(state, this.hover.x, this.hover.y), unit ? (getUnit(state, unit.id) ?? null) : null);
  }
}
