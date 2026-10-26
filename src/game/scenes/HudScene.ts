// Screen-space UI drawn on top of the battle: turn indicator, tile/unit info, menus,
// dialogs and banners. It runs as its own scene so its camera never scrolls with the map.

import Phaser from 'phaser';
import { getBuildingDef, getUnitDef } from '../../core/data';
import type { Building, TerrainDef, Unit } from '../../core/types';
import { FONT_SIZE, VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { pal, TEAM_RAMPS, UI } from '../gfx/palette';
import { tween, wait } from '../render/UnitLayer';
import { Button, Menu, Panel, text, textWidth, wrapText, type MenuItem } from '../ui/widgets';

export interface HudCallbacks {
  onEndTurn: () => void;
  onMenu?: () => void;
}

export interface PreviewSide {
  name: string;
  faction: string;
  hp: number;
  hpAfter: [number, number];
  /** Damage this side deals, or null if it cannot strike (no counter). */
  deals: [number, number] | null;
  terrain: string;
  terrainDef: number;
}

export interface InfoData {
  terrain: TerrainDef | null;
  unit: Unit | null;
  faction?: string;
  building?: Building | null;
  buildingFaction?: string;
  /** Flavour text shown under the stats (e.g. in the build menu). */
  blurb?: string;
}

export class HudScene extends Phaser.Scene {
  private turnPanel!: Panel;
  private turnDay!: Phaser.GameObjects.BitmapText;
  private turnName!: Phaser.GameObjects.BitmapText;
  private turnGold!: Phaser.GameObjects.BitmapText;
  private infoPanel!: Panel;
  private infoLines: Phaser.GameObjects.BitmapText[] = [];
  private endTurnBtn!: Button;
  private menuBtn!: Button;
  private callbacks!: HudCallbacks;
  private menu: Menu | null = null;
  private menuOpenedAt = 0;
  private dialog: Panel | null = null;
  private infoOnLeft = true;
  private preview: Panel | null = null;

  constructor() {
    super('Hud');
  }

  init(data: { callbacks: HudCallbacks }): void {
    this.callbacks = data.callbacks;
    this.infoLines = [];
    this.menu = null;
    this.dialog = null;
    this.preview = null;
  }

  create(): void {
    this.turnPanel = new Panel(this, 4, 4, 136, 18);
    this.turnDay = text(this, 7, 6, '');
    this.turnName = text(this, 7, 6, '');
    this.turnGold = text(this, 7, 6, '', UI.highlight);
    this.turnPanel.add([this.turnDay, this.turnName, this.turnGold]);

    this.infoPanel = new Panel(this, 4, VIEW_H - 40, 152, 36);
    for (let i = 0; i < 7; i++) {
      const t = text(this, 6, 5 + i * 10, '');
      this.infoLines.push(t);
      this.infoPanel.add(t);
    }
    this.infoPanel.setVisible(false);

    this.endTurnBtn = new Button(this, VIEW_W - 84, VIEW_H - 20, 80, 'END TURN', () => {
      sfx.play('confirm');
      this.callbacks.onEndTurn();
    });
    this.menuBtn = new Button(this, VIEW_W - 52, 4, 48, 'MENU', () => {
      sfx.play('confirm');
      this.callbacks.onMenu?.();
    });
    this.menuBtn.setVisible(!!this.callbacks.onMenu);

    const kb = this.input.keyboard!;
    const nav = (delta: number) => {
      if (!this.menu || this.time.now - this.menuOpenedAt < 120) return;
      this.menu.move(delta);
      sfx.play('cursor');
    };
    kb.on('keydown-UP', () => nav(-1));
    kb.on('keydown-W', () => nav(-1));
    kb.on('keydown-DOWN', () => nav(1));
    kb.on('keydown-S', () => nav(1));
    const confirm = () => {
      if (!this.menu || this.time.now - this.menuOpenedAt < 150) return;
      this.menu.confirm();
    };
    kb.on('keydown-ENTER', confirm);
    kb.on('keydown-SPACE', confirm);
    kb.on('keydown-Z', (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) confirm();
    });
  }

  // ---------------------------------------------------------------------------

  isOverUI(x: number, y: number): boolean {
    const btnHit = (b: Button) => b.visible && x >= b.x && y >= b.y && x < b.x + b.boxW && y < b.y + b.boxH + 2;
    return (
      this.turnPanel.containsScreen(x, y) ||
      this.infoPanel.containsScreen(x, y) ||
      btnHit(this.endTurnBtn) ||
      btnHit(this.menuBtn) ||
      !!this.menu?.containsScreen(x, y) ||
      !!this.dialog
    );
  }

  get menuOpen(): boolean {
    return !!this.menu || !!this.dialog;
  }

  setTurn(day: string, factionName: string, faction: string, gold?: number): void {
    this.turnDay.setText(day);
    this.turnName.setText(factionName.toUpperCase());
    this.turnName.x = this.turnDay.x + textWidth(day) + FONT_SIZE;
    this.turnName.setTint(pal(TEAM_RAMPS[faction][0]));
    let width = this.turnName.x + textWidth(this.turnName.text) + 7;
    this.turnGold.setVisible(gold !== undefined);
    if (gold !== undefined) {
      this.turnGold.setText(`${gold}G`);
      this.turnGold.x = width + 4;
      width += textWidth(this.turnGold.text) + 4;
    }
    this.turnPanel.resize(width, 18);
  }

  setInfo(info: InfoData | null): void {
    const lines: { s: string; c: number }[] = [];
    if (info?.unit) {
      const u = info.unit;
      const def = getUnitDef(u.type);
      const color = info.faction ? TEAM_RAMPS[info.faction][0] : UI.text;
      lines.push({ s: `${def.name.toUpperCase()}`, c: color });
      lines.push({ s: `HP ${Math.ceil(u.hp)}/${def.maxHp}  MOV ${def.move}`, c: UI.text });
      const rng = def.range[0] === def.range[1] ? `${def.range[0]}` : `${def.range[0]}-${def.range[1]}`;
      lines.push({ s: `ATK ${def.attack} DEF ${def.defense} RNG ${rng}`, c: UI.text });
    }
    if (info?.blurb) {
      for (const line of wrapText(info.blurb, 26)) lines.push({ s: line, c: UI.textDim });
    }
    if (info?.terrain) {
      const t = info.terrain;
      const sign = t.defense >= 0 ? '+' : '';
      lines.push({ s: `${t.name.toUpperCase()} DEF${sign}${t.defense}`, c: 20 });
    }
    if (info?.building) {
      const b = info.building;
      const def = getBuildingDef(b.type);
      const owner = info.buildingFaction ? info.buildingFaction.toUpperCase() : 'NEUTRAL';
      const color = info.buildingFaction ? TEAM_RAMPS[info.buildingFaction][0] : UI.textDim;
      const cap = b.capture ? ` CAP ${b.capture.points}/${def.capturePoints}` : '';
      lines.push({ s: `${owner} +${def.income}G${cap}`, c: color });
    }
    this.infoLines.forEach((t, i) => {
      t.setText(lines[i]?.s ?? '');
      t.setTint(pal(lines[i]?.c ?? UI.text));
    });
    this.infoPanel.setVisible(lines.length > 0);
    if (lines.length === 0) return;
    this.infoPanel.resize(Math.max(...lines.map((l) => textWidth(l.s))) + 12, lines.length * 10 + 7);
    this.placeInfo();
  }

  /** Keep the info panel away from the cursor (classic corner-flip). */
  setCursorScreen(x: number, y: number): void {
    const nearLeft = x < this.infoPanel.boxW + 16 && y > VIEW_H - this.infoPanel.boxH - 24;
    const nearRight = x > VIEW_W - this.infoPanel.boxW - 16 && y > VIEW_H - this.infoPanel.boxH - 24;
    if (this.infoOnLeft && nearLeft) this.infoOnLeft = false;
    else if (!this.infoOnLeft && nearRight) this.infoOnLeft = true;
    this.placeInfo();
  }

  private placeInfo(): void {
    this.infoPanel.y = VIEW_H - this.infoPanel.boxH - 4;
    // on the right side the end-turn button needs room
    this.infoPanel.x = this.infoOnLeft ? 4 : VIEW_W - this.infoPanel.boxW - 4;
    if (!this.infoOnLeft) this.infoPanel.y = VIEW_H - this.infoPanel.boxH - 26;
  }

  setButtonsEnabled(on: boolean): void {
    this.endTurnBtn.setEnabled(on);
    this.menuBtn.setEnabled(on);
  }

  // ---------------------------------------------------------------------------
  // Menus and dialogs

  /** Opens a menu near a screen position (kept inside the screen). */
  openMenu(items: MenuItem[], sx: number, sy: number, minWidth = 0): Menu {
    this.closeMenu();
    const m = new Menu(this, 0, 0, items, minWidth);
    let x = sx;
    let y = sy;
    if (x + m.boxW > VIEW_W - 4) x = sx - m.boxW - 20;
    x = Phaser.Math.Clamp(x, 4, VIEW_W - m.boxW - 4);
    y = Phaser.Math.Clamp(y, 24, VIEW_H - m.boxH - 24);
    m.setPosition(Math.round(x), Math.round(y));
    m.setDepth(1100);
    this.menu = m;
    this.menuOpenedAt = this.time.now;
    return m;
  }

  closeMenu(): void {
    this.menu?.destroy();
    this.menu = null;
  }

  /** Centered message with a list of choices. */
  dialogBox(message: string[], items: MenuItem[]): void {
    this.closeDialog();
    const width = Math.max(...message.map(textWidth), 120) + 24;
    const panel = new Panel(this, 0, 0, width, message.length * 11 + 14);
    message.forEach((line, i) => panel.add(text(this, Math.round((width - textWidth(line)) / 2), 8 + i * 11, line)));
    panel.setPosition(Math.round((VIEW_W - width) / 2), Math.round(VIEW_H / 2 - 40));
    panel.setDepth(1200);
    this.dialog = panel;
    const wrapped = items.map((it) => ({
      ...it,
      onSelect: () => {
        this.closeDialog();
        it.onSelect();
      },
    }));
    const m = this.openMenu(wrapped, 0, 0, 64);
    m.setPosition(Math.round((VIEW_W - m.boxW) / 2), panel.y + panel.boxH + 2);
    m.setDepth(1201);
  }

  closeDialog(): void {
    if (this.dialog) {
      this.dialog.destroy();
      this.dialog = null;
      this.closeMenu();
    }
  }

  // ---------------------------------------------------------------------------
  // Combat preview

  showPreview(attacker: PreviewSide, defender: PreviewSide): void {
    this.hidePreview();
    const w = 264;
    const h = 52;
    const panel = new Panel(this, Math.round((VIEW_W - w) / 2), 26, w, h);
    panel.setDepth(1050);
    const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`);
    const side = (p: PreviewSide, x: number, right: boolean) => {
      const put = (y: number, str: string, color: number) => {
        const t = text(this, right ? x - textWidth(str) : x, y, str, color);
        panel.add(t);
      };
      put(6, p.name.toUpperCase(), TEAM_RAMPS[p.faction][0]);
      const after = p.hpAfter[0] === 0 && p.hpAfter[1] === 0 ? 'KO' : range(p.hpAfter);
      put(17, `HP ${p.hp}>${after}`, p.hpAfter[0] === 0 ? UI.bad : UI.text);
      put(28, p.deals ? `DMG ${range(p.deals)}` : 'NO COUNTER', p.deals ? UI.highlight : UI.textDim);
      const sign = p.terrainDef >= 0 ? '+' : '';
      put(39, `${p.terrain.toUpperCase().slice(0, 8)} ${sign}${p.terrainDef}`, 20);
    };
    side(attacker, 8, false);
    side(defender, w - 8, true);
    panel.add(text(this, Math.round(w / 2 - 8), 17, 'VS', UI.textDim));
    this.preview = panel;
  }

  hidePreview(): void {
    this.preview?.destroy();
    this.preview = null;
  }

  // ---------------------------------------------------------------------------
  // Banner

  async banner(line: string, faction: string, sub?: string): Promise<void> {
    const h = sub ? 34 : 22;
    const panel = new Panel(this, -VIEW_W, Math.round(VIEW_H / 2 - h / 2), VIEW_W, h, 'dark');
    panel.setDepth(1300);
    const t = text(this, Math.round((VIEW_W - textWidth(line)) / 2), 7, line, TEAM_RAMPS[faction]?.[0] ?? UI.text);
    panel.add(t);
    if (sub) panel.add(text(this, Math.round((VIEW_W - textWidth(sub)) / 2), 20, sub, UI.textDim));
    const stripe = this.add.graphics();
    stripe.fillStyle(pal(TEAM_RAMPS[faction]?.[1] ?? UI.text));
    stripe.fillRect(0, 0, VIEW_W, 2);
    stripe.fillRect(0, h - 2, VIEW_W, 2);
    panel.add(stripe);
    await tween(this, { targets: panel, x: 0, duration: 220, ease: 'Cubic.easeOut' });
    await wait(this, 650);
    await tween(this, { targets: panel, x: VIEW_W, duration: 220, ease: 'Cubic.easeIn' });
    panel.destroy();
  }
}
