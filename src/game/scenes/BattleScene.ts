// The battle: map, units, selection, orders and turn flow. Rules live in src/core; this
// scene only turns input into core actions and plays back the resulting events.

import Phaser from 'phaser';
import { createAi, type AiController } from '../../core/ai';
import { previewAttack, targetsFrom, terrainDefense, threatTiles } from '../../core/combat';
import { getBuildingDef, getFaction, getUnitDef } from '../../core/data';
import { playerView, visibilityMask } from '../../core/fog';
import { canUndo, dispatch, newMatch, undo, type Match } from '../../core/match';
import { makeSave, restoreMatch, type SaveData } from '../../core/save';
import { computeReach, destinations, pathTo, type Reach } from '../../core/pathfinding';
import { buildingAt, getBuilding, getUnit, terrainAt, unitAt, type GameSetup } from '../../core/state';
import type { Action, Building, Coord, GameEvent, GameState, Unit } from '../../core/types';
import { TILE, VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { bakeDither } from '../gfx/bake';
import { pal, PALETTE_RGB, UI } from '../gfx/palette';
import { BuildingLayer } from '../render/BuildingLayer';
import { FogLayer } from '../render/FogLayer';
import { MapView } from '../render/MapView';
import { Overlays } from '../render/Overlays';
import { tween, UnitLayer, wait } from '../render/UnitLayer';
import { animTimings, getSettings, saves } from '../settings';
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

export type BattleInit = { setup: GameSetup; save?: undefined } | { save: SaveData; setup?: undefined };

export class BattleScene extends Phaser.Scene {
  private match!: Match;
  private mapView!: MapView;
  private units!: UnitLayer;
  private buildings!: BuildingLayer;
  private overlays!: Overlays;
  private fog!: FogLayer;
  private hud!: HudScene;
  /** The last human player whose eyes the screen showed. */
  private lastViewer: number | null = null;
  private viewCache: { state: GameState; viewer: number | null; view: GameState; mask: boolean[] | null } | null = null;
  private mode: Mode = 'idle';
  private selected: Selection | null = null;
  private hover: Coord = { x: 0, y: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private drag: { startX: number; startY: number; scrollX: number; scrollY: number; active: boolean } | null = null;
  private inspected: number | null = null;
  private previewTarget: Unit | null = null;
  private buildMenuOpen = false;
  private lastIncome = 0;
  private grid!: Phaser.GameObjects.Graphics;
  private ais = new Map<number, AiController>();
  /** Delay between AI actions in ms (scaled by the animation speed setting). */
  private aiPause = 220;

  constructor() {
    super('Battle');
  }

  init(data: BattleInit): void {
    this.match = data.save ? restoreMatch(data.save) : newMatch(data.setup);
    this.ais.clear();
    this.match.state.players.forEach((p, i) => {
      if (p.controller === 'ai') this.ais.set(i, createAi(this.match.setup.aiStyle ?? 'greedy'));
    });
    this.mode = 'idle';
    this.selected = null;
    this.inspected = null;
    this.viewCache = null;
    const s = this.match.state;
    this.lastViewer = s.players[s.currentPlayer].controller === 'human' ? s.currentPlayer : null;
  }

  create(): void {
    const state = this.match.state;
    this.cameras.main.setBackgroundColor(pal(1));
    bakeDither(this, 'dither-shade', PALETTE_RGB[1]);
    this.mapView = new MapView(this, state);
    const teamOf = (owner: number) => this.match.state.players[owner].faction;
    this.buildings = new BuildingLayer(this, teamOf);
    this.units = new UnitLayer(this, teamOf);
    this.overlays = new Overlays(this);
    this.fog = new FogLayer(this, state.width, state.height);
    this.syncWorld();

    this.scene.launch('Hud', { callbacks: { onEndTurn: () => this.requestEndTurn(), onMenu: () => this.openPauseMenu() } });
    this.hud = this.scene.get('Hud') as HudScene;
    this.grid = this.add.graphics().setDepth(45);
    this.applySettings();
    const onSettings = () => this.applySettings();
    this.game.events.on('settings-changed', onSettings);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('settings-changed', onSettings);
      this.scene.stop('Hud');
      this.scene.stop('GameOver');
    });

    this.setupInput();
    this.centerCameraOn(this.firstReadyUnit() ?? { x: 0, y: 0 });
    this.mode = 'busy';
    // the HUD scene finishes its create() on the next tick
    this.time.delayedCall(0, () => {
      if (this.state.gameOver) void this.showGameOver();
      else void this.beginTurn();
    });
  }

  private applySettings(): void {
    const s = getSettings();
    const t = animTimings(s.animSpeed);
    this.units.speed = { step: t.step, fx: t.fx };
    this.aiPause = t.aiPause;
    this.drawGrid(s.grid);
  }

  /** Faint dotted grid along tile edges. */
  private drawGrid(on: boolean): void {
    const g = this.grid;
    g.clear();
    if (!on) return;
    const { width, height } = this.state;
    g.fillStyle(pal(14));
    for (let y = 0; y <= height; y++) for (let x = 0; x < width * TILE; x += 2) g.fillRect(x, y * TILE, 1, 1);
    for (let x = 0; x <= width; x++) for (let y = 0; y < height * TILE; y += 2) g.fillRect(x * TILE, y, 1, 1);
  }

  // ---------------------------------------------------------------------------
  // Pause menu

  private openPauseMenu(): void {
    if (this.mode !== 'idle' || this.hud.menuOpen) return;
    this.clearInspect();
    sfx.play('select');
    const overlay = (scene: string, data: object) => {
      this.hud.closeDialog();
      this.scene.pause();
      this.scene.pause('Hud');
      this.scene.launch(scene, data);
      this.scene.bringToTop(scene);
    };
    this.hud.dialogBox(['PAUSED'], [
      { label: 'RESUME', onSelect: () => sfx.play('cancel') },
      { label: 'SAVE GAME', onSelect: () => overlay('Saves', { mode: 'save', from: 'Battle', match: this.match }) },
      { label: 'LOAD GAME', onSelect: () => overlay('Saves', { mode: 'load', from: 'Battle' }) },
      { label: 'SETTINGS', onSelect: () => overlay('Settings', { from: 'Battle' }) },
      { label: 'QUIT TO TITLE', onSelect: () => this.confirmQuit() },
    ]);
  }

  private confirmQuit(): void {
    this.hud.dialogBox(['QUIT TO THE TITLE SCREEN?', 'YOUR LAST AUTOSAVE IS KEPT.'], [
      { label: 'QUIT', onSelect: () => this.quitToTitle() },
      { label: 'CANCEL', onSelect: () => sfx.play('cancel') },
    ]);
  }

  private quitToTitle(): void {
    sfx.play('confirm');
    this.scene.stop('Hud');
    this.scene.stop('GameOver');
    this.scene.start('Menu');
  }

  private autosave(): void {
    try {
      saves.write('auto', makeSave(this.match));
    } catch (e) {
      console.warn('autosave failed', e);
    }
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
      else if (this.mode === 'targeting') this.confirmTarget();
    });
    kb.on('keydown-ENTER', () => {
      if (this.mode === 'targeting') this.confirmTarget();
    });
    kb.on('keydown-TAB', () => {
      if (this.mode === 'targeting') this.cycleTarget(1);
      else this.selectNextUnit();
    });
    kb.on('keydown-Z', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) this.undoMove();
    });
    const cycle = (d: number) => () => {
      if (this.mode === 'targeting') this.cycleTarget(d);
    };
    kb.on('keydown-LEFT', cycle(-1));
    kb.on('keydown-UP', cycle(-1));
    kb.on('keydown-RIGHT', cycle(1));
    kb.on('keydown-DOWN', cycle(1));

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
    if (this.mode === 'targeting') {
      const target = this.currentTargets().find((u) => u.x === t.x && u.y === t.y);
      if (target) this.setPreviewTarget(target);
    }
    this.refreshInfo();
  }

  override update(_time: number, delta: number): void {
    if (this.hud?.menuOpen || this.mode === 'targeting') return;
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

  /** The human whose eyes the screen shows, or null when spectating an all-AI battle. */
  private get viewer(): number | null {
    const s = this.state;
    if (s.players[s.currentPlayer].controller === 'human') return s.currentPlayer;
    if (this.lastViewer !== null) return this.lastViewer;
    const first = s.players.findIndex((p) => p.controller === 'human');
    return first >= 0 ? first : null;
  }

  private viewInfo(): { view: GameState; mask: boolean[] | null } {
    const state = this.state;
    const viewer = this.viewer;
    const c = this.viewCache;
    if (c && c.state === state && c.viewer === viewer) return c;
    const fogged = state.options.fog && viewer !== null;
    const next = {
      state,
      viewer,
      view: fogged ? playerView(state, viewer) : state,
      mask: fogged ? visibilityMask(state, viewer) : null,
    };
    this.viewCache = next;
    return next;
  }

  /** The battle as the viewer knows it: enemies in the fog are left out. */
  private get view(): GameState {
    return this.viewInfo().view;
  }

  private seen(c: Coord): boolean {
    const mask = this.viewInfo().mask;
    return !mask || mask[c.y * this.state.width + c.x];
  }

  private canViewerSee(u: Unit): boolean {
    return u.owner === this.viewer || this.seen(u);
  }

  /** Redraws units, buildings and fog for the current state and viewer. */
  private syncWorld(): void {
    this.units.sync(this.state, (u) => this.canViewerSee(u));
    this.buildings.sync(this.view);
    this.fog.update(this.viewInfo().mask);
  }

  private isReady(u: Unit | undefined): boolean {
    return !!u && u.owner === this.state.currentPlayer && !u.acted && !u.moved;
  }

  private onTileClick(t: Coord): void {
    if (!this.inside(t)) return;
    const unit = unitAt(this.view, t.x, t.y);
    switch (this.mode) {
      case 'idle': {
        const b = buildingAt(this.state, t.x, t.y);
        if (unit && this.isReady(unit)) {
          this.select(unit);
        } else if (unit && unit.owner !== this.state.currentPlayer) {
          this.toggleInspect(unit);
        } else if (!unit && b && b.owner === this.state.currentPlayer && getBuildingDef(b.type).produces.length > 0) {
          this.openBuildMenu(b);
        } else {
          this.clearInspect();
        }
        break;
      }
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
        const target = this.currentTargets().find((u) => u.x === t.x && u.y === t.y);
        if (!target) this.backToMenu();
        else if (this.previewTarget?.id === target.id) void this.orderAttack(target);
        else this.setPreviewTarget(target);
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
    const reach = computeReach(this.view, unit);
    const dests = destinations(this.view, unit, reach);
    this.overlays.show('danger', threatTiles(this.view, unit, dests));
    sfx.play('select');
  }

  private clearInspect(): void {
    if (this.inspected === null) return;
    this.inspected = null;
    this.overlays.clear('danger');
  }

  private select(unit: Unit): void {
    this.clearInspect();
    const reach = computeReach(this.view, unit);
    const dests = destinations(this.view, unit, reach);
    this.selected = { unit, reach, dests };
    this.mode = 'selected';
    this.overlays.show('move', dests);
    const destSet = new Set(dests.map((d) => d.y * this.state.width + d.x));
    this.overlays.show('attack', threatTiles(this.view, unit, dests).filter((c) => !destSet.has(c.y * this.state.width + c.x)));
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
        if (this.buildMenuOpen || !this.selected) {
          this.buildMenuOpen = false;
          this.hud.closeMenu();
          this.mode = 'idle';
          sfx.play('cancel');
          break;
        }
        if (this.selected.unit.moved) {
          this.undoMove();
        } else {
          this.hud.closeMenu();
          this.select(this.selected!.unit);
          sfx.play('cancel');
        }
        break;
      case 'targeting':
        this.backToMenu();
        break;
      case 'idle':
        if (this.inspected !== null) this.clearInspect();
        else this.openPauseMenu();
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
    if (!moved || moved.acted) {
      // ambushed: the unit's turn is over
      this.selected = null;
      this.mode = 'idle';
      this.refreshInfo();
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
    const targets = targetsFrom(this.view, unit, unit);
    const canFire = !unit.moved || def.moveAndFire;
    const items: MenuItem[] = [];
    if (targets.length > 0 && canFire) {
      items.push({ label: 'ATTACK', onSelect: () => this.startTargeting() });
    }
    const b = buildingAt(this.state, unit.x, unit.y);
    if (def.canCapture && b && b.owner !== unit.owner) {
      const required = getBuildingDef(b.type).capturePoints;
      const done = b.capture?.unitId === unit.id ? b.capture.points : 0;
      items.push({ label: 'CAPTURE', detail: `${done}/${required}`, onSelect: () => void this.orderCapture() });
    }
    items.push({ label: 'WAIT', onSelect: () => void this.orderWait() });
    const s = this.screenOf(unit);
    this.hud.openMenu(items, s.x + TILE + 4, s.y - 4);
    this.overlays.moveCursor(unit);
  }

  private backToMenu(): void {
    sfx.play('cancel');
    this.previewTarget = null;
    this.hud.hidePreview();
    this.openActionMenu();
  }

  private currentTargets(): Unit[] {
    const unit = this.selected?.unit;
    return unit ? targetsFrom(this.view, unit, unit) : [];
  }

  private startTargeting(): void {
    const unit = this.selected!.unit;
    this.hud.closeMenu();
    this.mode = 'targeting';
    sfx.play('confirm');
    const targets = this.currentTargets();
    this.overlays.show('attack', threatTiles(this.view, unit, [unit]));
    this.overlays.show('target', targets.map((u) => ({ x: u.x, y: u.y })));
    const hovered = targets.find((u) => u.x === this.hover.x && u.y === this.hover.y);
    this.setPreviewTarget(hovered ?? targets[0]);
  }

  private setPreviewTarget(target: Unit): void {
    const unit = this.selected!.unit;
    if (this.previewTarget?.id !== target.id) sfx.play('cursor');
    this.previewTarget = target;
    this.overlays.moveCursor(target);
    this.showPreview(unit, target);
  }

  private showPreview(unit: Unit, target: Unit): void {
    const p = previewAttack(this.state, unit, target);
    const side = (u: Unit, hpAfter: [number, number], deals: [number, number] | null) => ({
      name: getUnitDef(u.type).name,
      faction: this.state.players[u.owner].faction,
      hp: u.hp,
      hpAfter,
      deals,
      terrain: terrainAt(this.state, u.x, u.y).name,
      terrainDef: terrainDefense(this.state, u),
    });
    this.hud.showPreview(side(unit, p.attackerHpAfter, p.damage), side(target, p.defenderHpAfter, p.counter));
  }

  private cycleTarget(delta: number): void {
    const targets = this.currentTargets();
    if (targets.length === 0) return;
    const i = targets.findIndex((u) => u.id === this.previewTarget?.id);
    this.setPreviewTarget(targets[(i + delta + targets.length) % targets.length]);
  }

  private confirmTarget(): void {
    if (this.previewTarget) void this.orderAttack(this.previewTarget);
  }

  private undoMove(): void {
    if (this.mode !== 'menu' || !this.selected || !canUndo(this.match)) return;
    const id = this.selected.unit.id;
    if (!undo(this.match)) return;
    this.hud.closeMenu();
    this.syncWorld();
    const unit = getUnit(this.state, id)!;
    sfx.play('cancel');
    this.select(unit);
  }

  private async orderAttack(target: Unit): Promise<void> {
    const unit = this.selected!.unit;
    this.previewTarget = null;
    this.hud.hidePreview();
    this.overlays.clear();
    this.mode = 'busy';
    sfx.play('confirm');
    await this.perform({ type: 'attack', unitId: unit.id, targetId: target.id });
    this.afterOrder();
  }

  private async orderCapture(): Promise<void> {
    const unit = this.selected!.unit;
    this.hud.closeMenu();
    this.mode = 'busy';
    sfx.play('confirm');
    await this.perform({ type: 'capture', unitId: unit.id });
    this.afterOrder();
  }

  private openBuildMenu(b: Building): void {
    this.clearInspect();
    const def = getBuildingDef(b.type);
    const gold = this.state.players[this.state.currentPlayer].gold;
    sfx.play('select');
    this.mode = 'menu';
    this.overlays.moveCursor(b);
    const close = () => {
      this.buildMenuOpen = false;
      this.hud.closeMenu();
      this.mode = 'idle';
      this.refreshInfo();
    };
    const items: MenuItem[] = def.produces.map((type) => {
      const u = getUnitDef(type);
      return {
        label: u.name.toUpperCase(),
        detail: `${u.cost}G`,
        enabled: u.cost <= gold,
        onHover: () => this.hud.setInfo({ terrain: null, unit: this.previewUnit(type, b), faction: this.state.players[this.state.currentPlayer].faction, blurb: u.blurb }),
        onSelect: () => {
          close();
          void this.orderBuild(b, type);
        },
      };
    });
    items.push({ label: 'CANCEL', onSelect: () => {
      sfx.play('cancel');
      close();
    } });
    // top right, clear of the info panel that shows the highlighted unit's stats
    this.hud.openMenu(items, VIEW_W, 26, 140);
    this.buildMenuOpen = true;
  }

  /** A stand-in unit used to show stats in the info panel while browsing the build menu. */
  private previewUnit(type: string, at: Coord): Unit {
    return { id: -1, type, owner: this.state.currentPlayer, x: at.x, y: at.y, hp: getUnitDef(type).maxHp, moved: false, acted: false };
  }

  private async orderBuild(b: Building, type: string): Promise<void> {
    this.buildMenuOpen = false;
    this.mode = 'busy';
    await this.perform({ type: 'build', buildingId: b.id, unitType: type });
    this.mode = 'idle';
    this.refreshInfo();
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
    if (ready === 0 || !getSettings().confirmEndTurn) {
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
    const p = this.state.players[this.state.currentPlayer];
    const humans = this.state.players.filter((pl) => pl.controller === 'human').length;
    if (p.controller === 'human') {
      const handover = humans > 1 && this.state.options.fog && this.lastViewer !== this.state.currentPlayer;
      if (handover) await this.hud.curtain(getFaction(p.faction).name.toUpperCase(), p.faction);
      this.lastViewer = this.state.currentPlayer;
    }
    this.syncWorld();
    this.refreshHud();
    const first = this.firstReadyUnit();
    if (first) void this.ensureVisible(first);
    sfx.play('turnStart');
    const income = this.lastIncome;
    const sub = `${getFaction(p.faction).name.toUpperCase()}${income > 0 ? `   +${income}G` : ''}`;
    await this.hud.banner(this.dayLabel(), p.faction, sub);
    const ai = this.ais.get(this.state.currentPlayer);
    if (!ai) this.autosave();
    if (ai) {
      // run the AI after this event chain has finished animating
      this.time.delayedCall(0, () => void this.runAiTurn(ai));
      return;
    }
    this.mode = 'idle';
  }

  /** Plays the AI's turn action by action, animating each one. */
  private async runAiTurn(ai: AiController): Promise<void> {
    const player = this.state.currentPlayer;
    this.mode = 'busy';
    this.hud.setButtonsEnabled(false);
    for (let step = 0; step < 500; step++) {
      if (this.state.gameOver || this.state.currentPlayer !== player || !this.scene.isActive()) return;
      let action: Action;
      try {
        action = ai.nextAction(playerView(this.state, player));
      } catch (e) {
        console.error('AI failed', e);
        action = { type: 'endTurn' };
      }
      if (action.type !== 'endTurn') await this.showAiIntent(action);
      if (action.type === 'endTurn') sfx.play('endTurn');
      const ok = await this.perform(action);
      if (!ok) {
        // never let a confused AI hang the game
        const fallback: Action = 'unitId' in action ? { type: 'wait', unitId: action.unitId } : { type: 'endTurn' };
        if (!(await this.perform(fallback))) await this.perform({ type: 'endTurn' });
      }
      if (action.type === 'endTurn') return;
      await wait(this, this.aiPause);
    }
    await this.perform({ type: 'endTurn' });
  }

  /** Lets the player see what the AI is about to do. */
  private async showAiIntent(action: Action): Promise<void> {
    if (!('unitId' in action)) return;
    const unit = getUnit(this.state, action.unitId);
    // never pan to, or hint at, units hidden in the fog
    if (!unit || !this.canViewerSee(unit)) return;
    await this.ensureVisible(unit);
    this.overlays.moveCursor(unit);
    if (action.type === 'move') {
      const shown = action.path.filter((c) => this.seen(c));
      const end = action.path[action.path.length - 1];
      this.overlays.showPath(shown.length === action.path.length ? action.path : []);
      await wait(this, this.aiPause);
      this.overlays.showPath([]);
      if (this.seen(end)) await this.ensureVisible(end);
    } else if (action.type === 'attack') {
      const target = getUnit(this.state, action.targetId);
      if (!target || !this.canViewerSee(target)) return;
      this.overlays.show('target', [{ x: target.x, y: target.y }]);
      this.showPreview(unit, target);
      await wait(this, this.aiPause * 2.5);
      this.hud.hidePreview();
      this.overlays.clear('target');
    }
  }

  // ---------------------------------------------------------------------------
  // Applying actions and animating events

  private async perform(action: Action): Promise<boolean> {
    const actingPlayer = this.state.currentPlayer;
    const res = dispatch(this.match, action);
    if (!res.ok) {
      console.warn('rejected action', action, res.error);
      sfx.play('error');
      return false;
    }
    this.hud.setButtonsEnabled(false);
    const actor = actingPlayer;
    for (const ev of res.events) await this.animate(ev);
    this.syncWorld();
    // keep "Continue" current; never save between a move and the order that completes it
    if (!this.ais.has(actor) && action.type !== 'move' && action.type !== 'endTurn' && !this.state.gameOver) this.autosave();
    this.hud.setButtonsEnabled(!this.ais.has(this.state.currentPlayer));
    this.refreshHud();
    return true;
  }

  private async animate(ev: GameEvent): Promise<void> {
    switch (ev.type) {
      case 'moved': {
        const unit = getUnit(this.state, ev.unitId);
        if (!unit) break;
        const own = unit.owner === this.viewer;
        const visibleAt = (c: Coord) => own || this.seen(c);
        if (!ev.path.some(visibleAt)) break; // moved entirely inside the fog
        this.units.ensure(unit, ev.path[0]);
        await this.units.moveAlong(ev.unitId, ev.path, () => sfx.play('step'), visibleAt);
        break;
      }
      case 'ambushed': {
        const unit = getUnit(this.state, ev.unitId);
        if (unit && this.canViewerSee(unit)) {
          sfx.play('error');
          await this.popup(unit, '!AMBUSH!', UI.danger);
        }
        break;
      }
      case 'attacked': {
        const attacker = this.unitPos(ev.attackerId);
        const defender = this.unitPos(ev.defenderId);
        if (attacker && defender) {
          sfx.play('attack');
          await this.units.lunge(ev.attackerId, defender);
        }
        if (defender) {
          // the defender may be visible even when the attacker shoots from the fog
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
      case 'captureProgress': {
        const b = getBuilding(this.state, ev.buildingId);
        if (b && this.seen(b)) {
          sfx.play('select');
          this.buildings.sync(this.view);
          await this.popup(b, `${ev.points}/${ev.required}`, UI.highlight);
        }
        break;
      }
      case 'captured': {
        const b = getBuilding(this.state, ev.buildingId);
        this.buildings.sync(this.view);
        if (b && this.seen(b)) {
          sfx.play('capture');
          this.buildings.flash(b.id);
          await this.popup(b, 'TAKEN!', UI.highlight);
        }
        break;
      }
      case 'built': {
        const u = getUnit(this.state, ev.unitId);
        if (u && this.canViewerSee(u)) {
          sfx.play('build');
          this.syncWorld();
          void this.popup(u, 'NEW', UI.good);
          await wait(this, 250);
        }
        break;
      }
      case 'healed': {
        const u = getUnit(this.state, ev.unitId);
        if (u && this.canViewerSee(u)) void this.popup(u, `+${ev.amount}`, UI.good);
        break;
      }
      case 'eliminated':
        this.syncWorld();
        break;
      case 'turnStarted':
        this.lastIncome = ev.income;
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
    try {
      saves.remove('auto');
    } catch {
      // storage unavailable: nothing to clean up
    }
    const data: GameOverData = {
      state: this.state,
      viewer: humans.length === 1 ? humans[0] : null,
      onRematch: () => {
        this.scene.stop('GameOver');
        this.scene.restart({ setup: { ...this.match.setup, seed: Date.now() } });
      },
      onMenu: () => this.quitToTitle(),
    };
    this.scene.launch('GameOver', data);
  }

  // ---------------------------------------------------------------------------
  // HUD

  private firstReadyUnit(): Unit | undefined {
    return this.state.units.find((u) => this.isReady(u));
  }

  private dayLabel(): string {
    const limit = this.state.options.dayLimit;
    return limit > 0 ? `DAY ${this.state.round}/${limit}` : `DAY ${this.state.round}`;
  }

  private refreshHud(): void {
    if (!this.hud?.sys.isActive()) return;
    const p = this.state.players[this.state.currentPlayer];
    const hasEconomy = this.state.buildings.length > 0;
    this.hud.setTurn(this.dayLabel(), getFaction(p.faction).name, p.faction, hasEconomy ? p.gold : undefined);
    this.refreshInfo();
  }

  private refreshInfo(): void {
    if (!this.hud?.sys.isActive() || !this.inside(this.hover) || this.buildMenuOpen) return;
    const unit = unitAt(this.view, this.hover.x, this.hover.y) ?? null;
    const b = buildingAt(this.view, this.hover.x, this.hover.y) ?? null;
    this.hud.setInfo({
      terrain: terrainAt(this.state, this.hover.x, this.hover.y),
      unit,
      faction: unit ? this.state.players[unit.owner].faction : undefined,
      building: b,
      buildingFaction: b && b.owner !== null ? this.state.players[b.owner].faction : undefined,
    });
  }
}
