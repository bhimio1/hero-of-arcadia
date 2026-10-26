// Retro UI building blocks: bevelled windows, bitmap text, chunky buttons and menus.
// Everything is drawn with palette colours on whole pixels.

import Phaser from 'phaser';
import { FONT, FONT_SIZE } from '../config';
import { sfx } from '../audio/sfx';
import { pal, UI } from '../gfx/palette';

export const DEPTH_UI = 1000;

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  color: number = UI.text,
): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), FONT, str, FONT_SIZE);
  t.setTint(pal(color));
  return t;
}

/** Text with a 1px drop shadow in ink colour, for text drawn over the map. */
export function shadowText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  color: number = UI.text,
): Phaser.GameObjects.Container {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const shadow = text(scene, 1, 1, str, UI.ink);
  const main = text(scene, 0, 0, str, color);
  c.add([shadow, main]);
  c.setData('set', (s: string, col?: number) => {
    shadow.setText(s);
    main.setText(s);
    if (col !== undefined) main.setTint(pal(col));
  });
  return c;
}

export function textWidth(str: string): number {
  return str.length * FONT_SIZE;
}

export type WindowStyle = 'blue' | 'dark' | 'light';

const STYLES: Record<WindowStyle, { fill: number; light: number; shadow: number; border: number }> = {
  blue: { fill: UI.windowFill, light: UI.windowLight, shadow: UI.windowFillDark, border: UI.windowShadow },
  dark: { fill: 1, light: 15, shadow: 0, border: 0 },
  light: { fill: 20, light: 21, shadow: 22, border: 1 },
};

/** Draws a bevelled window with 1px rounded corners. */
export function drawWindow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: WindowStyle = 'blue'): void {
  const s = STYLES[style];
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  // outer border (corners left open for a rounded look)
  g.fillStyle(pal(s.border));
  g.fillRect(x + 1, y, w - 2, 1);
  g.fillRect(x + 1, y + h - 1, w - 2, 1);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
  // fill
  g.fillStyle(pal(s.fill));
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  // bevel
  g.fillStyle(pal(s.light));
  g.fillRect(x + 1, y + 1, w - 2, 1);
  g.fillRect(x + 1, y + 1, 1, h - 2);
  g.fillStyle(pal(s.shadow));
  g.fillRect(x + 1, y + h - 2, w - 2, 1);
  g.fillRect(x + w - 2, y + 2, 1, h - 3);
}

/** A window fixed to the screen (ignores camera scroll). */
export class Panel extends Phaser.GameObjects.Container {
  protected bg: Phaser.GameObjects.Graphics;
  public boxW: number;
  public boxH: number;
  private style: WindowStyle;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: WindowStyle = 'blue') {
    super(scene, Math.round(x), Math.round(y));
    this.boxW = w;
    this.boxH = h;
    this.style = style;
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.redraw();
    this.setScrollFactor(0);
    this.setDepth(DEPTH_UI);
    scene.add.existing(this);
  }

  resize(w: number, h: number): void {
    this.boxW = w;
    this.boxH = h;
    this.redraw();
  }

  protected redraw(): void {
    this.bg.clear();
    drawWindow(this.bg, 0, 0, this.boxW, this.boxH, this.style);
  }

  /** True if a screen-space point is inside the panel. */
  containsScreen(px: number, py: number): boolean {
    return this.visible && px >= this.x && py >= this.y && px < this.x + this.boxW && py < this.y + this.boxH;
  }
}

export class Button extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.BitmapText;
  private hovered = false;
  private pressed = false;
  private enabled = true;
  public boxW: number;
  public boxH: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, label: string, private onClick: () => void) {
    super(scene, Math.round(x), Math.round(y));
    this.boxW = w;
    this.boxH = FONT_SIZE + 8;
    this.g = scene.add.graphics();
    this.label = text(scene, 0, 4, label);
    this.add([this.g, this.label]);
    this.setSize(this.boxW, this.boxH);
    this.setScrollFactor(0);
    this.setDepth(DEPTH_UI);
    this.setInteractive(new Phaser.Geom.Rectangle(this.boxW / 2, this.boxH / 2, this.boxW, this.boxH), Phaser.Geom.Rectangle.Contains);
    this.on('pointerover', () => {
      this.hovered = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      this.pressed = true;
      this.redraw();
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      const fire = this.pressed && this.enabled;
      this.pressed = false;
      this.redraw();
      if (fire) this.onClick();
    });
    this.setLabel(label);
    scene.add.existing(this);
  }

  setLabel(label: string): void {
    this.label.setText(label);
    this.label.x = Math.round((this.boxW - textWidth(label)) / 2);
    this.redraw();
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.redraw();
    return this;
  }

  private redraw(): void {
    const g = this.g;
    g.clear();
    const off = this.pressed ? 1 : 0;
    // drop shadow
    g.fillStyle(pal(UI.ink));
    g.fillRect(1, 2, this.boxW - 1, this.boxH - 1);
    const fill = !this.enabled ? 24 : this.hovered ? 17 : 16;
    g.fillStyle(pal(UI.ink));
    g.fillRect(off, off, this.boxW - 1, this.boxH - 1);
    g.fillStyle(pal(fill));
    g.fillRect(off + 1, off + 1, this.boxW - 3, this.boxH - 3);
    g.fillStyle(pal(this.enabled ? 19 : 22));
    g.fillRect(off + 1, off + 1, this.boxW - 3, 1);
    g.fillStyle(pal(this.enabled ? 15 : 25));
    g.fillRect(off + 1, off + this.boxH - 3, this.boxW - 3, 1);
    this.label.y = 4 + off;
    this.label.setTint(pal(this.enabled ? (this.hovered ? UI.highlight : UI.text) : UI.textDim));
  }
}

export interface MenuItem {
  label: string;
  enabled?: boolean;
  /** Optional right-aligned detail text (e.g. a cost). */
  detail?: string;
  onSelect: () => void;
  onHover?: () => void;
  /** Left/right arrows on this row (for option pickers). */
  onLeft?: () => void;
  onRight?: () => void;
}

/**
 * Vertical list menu with a blinking arrow. Mouse hover/click and keyboard
 * (up/down/enter) both work; the owning scene forwards key presses.
 */
export class Menu extends Panel {
  private rows: { label: Phaser.GameObjects.BitmapText; detail?: Phaser.GameObjects.BitmapText }[] = [];
  private arrow: Phaser.GameObjects.Sprite;
  private index = 0;
  private hitZone: Phaser.GameObjects.Zone;
  static readonly ROW_H = 12;

  constructor(scene: Phaser.Scene, x: number, y: number, private items: MenuItem[], minWidth = 0) {
    const labelW = Math.max(...items.map((i) => textWidth(i.label) + (i.detail ? textWidth(i.detail) + 12 : 0)));
    const w = Math.max(minWidth, labelW + 24);
    const h = items.length * Menu.ROW_H + 8;
    super(scene, x, y, w, h);
    items.forEach((item, i) => {
      const label = text(scene, 16, 6 + i * Menu.ROW_H, item.label, item.enabled === false ? UI.textDim : UI.text);
      const row: (typeof this.rows)[number] = { label };
      this.add(label);
      if (item.detail) {
        row.detail = text(scene, w - 8 - textWidth(item.detail), 6 + i * Menu.ROW_H, item.detail, item.enabled === false ? UI.textDim : UI.highlight);
        this.add(row.detail);
      }
      this.rows.push(row);
    });
    this.arrow = scene.add.sprite(6, 6, 'ui/arrow', 'default0').setOrigin(0, 0);
    this.add(this.arrow);
    scene.tweens.add({ targets: this.arrow, alpha: { from: 1, to: 0.25 }, duration: 260, yoyo: true, repeat: -1, ease: 'Stepped' });
    // Phaser hit-tests children with their own scroll factor, so pin the zone to the screen too
    this.hitZone = scene.add.zone(0, 0, w, h).setOrigin(0, 0).setScrollFactor(0).setInteractive();
    this.add(this.hitZone);
    this.hitZone.on('pointermove', (p: Phaser.Input.Pointer) => {
      const i = this.rowAt(p);
      if (i >= 0 && i !== this.index) this.select(i);
    });
    this.hitZone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      const i = this.rowAt(p);
      if (i >= 0) {
        this.select(i);
        this.confirm();
      }
    });
    const first = items.findIndex((i) => i.enabled !== false);
    this.select(first >= 0 ? first : 0);
  }

  private rowAt(p: Phaser.Input.Pointer): number {
    const ly = p.y - this.y - 4;
    const i = Math.floor(ly / Menu.ROW_H);
    return i >= 0 && i < this.items.length ? i : -1;
  }

  select(i: number): void {
    this.index = i;
    this.arrow.y = 6 + i * Menu.ROW_H;
    this.rows.forEach((r, j) => {
      const enabled = this.items[j].enabled !== false;
      r.label.setTint(pal(!enabled ? UI.textDim : j === i ? UI.highlight : UI.text));
    });
    this.items[i]?.onHover?.();
  }

  move(delta: number): void {
    const n = this.items.length;
    let i = this.index;
    for (let k = 0; k < n; k++) {
      i = (i + delta + n) % n;
      if (this.items[i].enabled !== false) break;
    }
    this.select(i);
  }

  confirm(): void {
    const item = this.items[this.index];
    if (item && item.enabled !== false) item.onSelect();
  }

  get selectedIndex(): number {
    return this.index;
  }

  get selectedItem(): MenuItem | undefined {
    return this.items[this.index];
  }

  setDetail(i: number, detail: string): void {
    const row = this.rows[i];
    if (!row?.detail) return;
    row.detail.setText(detail);
    row.detail.x = this.boxW - 8 - textWidth(detail);
  }
}

/**
 * Keyboard navigation for whichever menu `getMenu` returns: arrows/WASD to move,
 * left/right for option rows, Enter/Space to confirm, Esc/Backspace for `onBack`.
 */
export function bindMenuKeys(scene: Phaser.Scene, getMenu: () => Menu | null, onBack?: () => void): void {
  const kb = scene.input.keyboard!;
  kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,TAB');
  const openedAt = scene.time.now;
  const ready = () => scene.time.now - openedAt > 150 && scene.sys.isActive();
  const nav = (d: number) => () => {
    const m = getMenu();
    if (!m || !ready()) return;
    m.move(d);
    sfx.play('cursor');
  };
  const side = (dir: 'onLeft' | 'onRight') => () => {
    const item = getMenu()?.selectedItem;
    if (!item?.[dir] || !ready()) return;
    item[dir]!();
    sfx.play('cursor');
  };
  kb.on('keydown', () => sfx.unlock());
  kb.on('keydown-UP', nav(-1));
  kb.on('keydown-W', nav(-1));
  kb.on('keydown-DOWN', nav(1));
  kb.on('keydown-S', nav(1));
  kb.on('keydown-LEFT', side('onLeft'));
  kb.on('keydown-A', side('onLeft'));
  kb.on('keydown-RIGHT', side('onRight'));
  kb.on('keydown-D', side('onRight'));
  const confirm = () => {
    const m = getMenu();
    if (m && ready()) m.confirm();
  };
  kb.on('keydown-ENTER', confirm);
  kb.on('keydown-SPACE', confirm);
  if (onBack) {
    kb.on('keydown-ESC', () => ready() && onBack());
    kb.on('keydown-BACKSPACE', () => ready() && onBack());
  }
  scene.input.on('pointerdown', () => sfx.unlock());
}

/** Option row helper: a menu item that cycles through `values`. */
export function optionItem<T>(
  label: string,
  values: readonly T[],
  initial: T,
  show: (v: T) => string,
  onChange: (v: T) => void,
  getMenu: () => Menu | null,
  rowIndex: () => number,
): MenuItem {
  let i = Math.max(0, values.indexOf(initial));
  const set = (d: number) => {
    i = (i + d + values.length) % values.length;
    getMenu()?.setDetail(rowIndex(), show(values[i]));
    onChange(values[i]);
  };
  return {
    label,
    detail: show(values[i]),
    onSelect: () => {
      set(1);
      sfx.play('cursor');
    },
    onLeft: () => set(-1),
    onRight: () => set(1),
  };
}

/** Upper-cases and word-wraps text to lines of at most `width` characters. */
export function wrapText(str: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of str.toUpperCase().split(/\s+/)) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Centered one-line hint on a solid ink strip, readable over busy backgrounds. */
export function hintText(scene: Phaser.Scene, y: number, str: string, color: number = UI.textDim): Phaser.GameObjects.Container {
  const w = textWidth(str) + 8;
  const x = Math.round((scene.scale.width - w) / 2);
  const c = scene.add.container(x, Math.round(y)).setScrollFactor(0).setDepth(650);
  const g = scene.add.graphics();
  g.fillStyle(pal(UI.ink));
  g.fillRect(0, 0, w, 12);
  c.add([g, text(scene, 4, 2, str, color)]);
  return c;
}
