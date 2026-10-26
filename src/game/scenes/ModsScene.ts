// Mod manager: turn mods on and off, change their load order, import mod files and remove
// imported ones. Problems are shown as soon as a change is made (by trying the mods without
// activating them); the new set is activated when leaving the screen.

import Phaser from 'phaser';
import { modSummary, type ModFailure, type ModManifest } from '../../core/mods';
import type { ContentIssue } from '../../core/validate';
import { VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { pal, UI } from '../gfx/palette';
import {
  activateMods,
  bundleErrors,
  enabledMods,
  getModChoices,
  importMod,
  orderedMods,
  pickModFile,
  removeImportedMod,
  setModChoices,
  tryMods,
  type ModChoices,
  type ModRecord,
} from '../mods';
import { addBackdrop } from '../render/Backdrop';
import { bindMenuKeys, hintText, Menu, Panel, text, textWidth, wrapText, type MenuItem } from '../ui/widgets';

const INFO_X = 252;
const INFO_W = VIEW_W - INFO_X - 8;
const INFO_COLS = 25;
const INFO_MAX_LINES = 19;
const NAME_COLS = 19;

export class ModsScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private info: Panel | null = null;
  private hint: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.BitmapText | null = null;
  private choices!: ModChoices;
  private records: ModRecord[] = [];
  private failures = new Map<string, ModFailure>();
  private warnings: ContentIssue[] = [];
  /** Index of the mod whose actions are open, or -1 for the list. */
  private acting = -1;
  private dirty = false;
  private pickedAt = -Infinity;

  constructor() {
    super('Mods');
  }

  create(): void {
    addBackdrop(this, 'wildwood');
    this.menu = null;
    this.info = null;
    this.hint = null;
    this.acting = -1;
    this.dirty = false;
    this.pickedAt = -Infinity;
    this.choices = getModChoices();
    const title = 'MODS';
    text(this, Math.round((VIEW_W - textWidth(title) * 2) / 2), 8, title, UI.highlight).setScale(2).setScrollFactor(0).setDepth(600);
    this.toast = text(this, 0, VIEW_H - 28, '', UI.good).setScrollFactor(0).setDepth(900);
    this.refresh();
    this.showList(0);
    bindMenuKeys(this, () => this.menu, () => this.back());
  }

  /** Re-reads the mod list and checks the enabled mods (without activating them). */
  private refresh(): void {
    this.records = orderedMods(this.choices);
    // keep the order complete so moving a mod up or down is well defined
    this.choices.order = this.records.map((r) => r.mod.id);
    this.choices.enabled = this.choices.enabled.filter((id) => this.records.some((r) => r.mod.id === id));
    const result = tryMods(enabledMods(this.choices));
    this.failures = new Map(result.failed.map((f) => [f.mod.id, f]));
    this.warnings = result.warnings;
  }

  private status(mod: ModManifest): string {
    if (!this.choices.enabled.includes(mod.id)) return 'OFF';
    return this.failures.has(mod.id) ? 'ERROR' : 'ON';
  }

  // ---------------------------------------------------------------------------
  // List of mods

  private showList(selected: number): void {
    this.acting = -1;
    const items: MenuItem[] = this.records.map((r, i) => ({
      label: r.mod.name.toUpperCase().slice(0, NAME_COLS),
      detail: this.status(r.mod),
      onHover: () => this.showMod(r),
      onSelect: () => this.showActions(i),
    }));
    items.push({ label: 'IMPORT MOD FILE', onHover: () => this.showAbout(), onSelect: () => this.importFile() });
    items.push({ label: 'DONE', onHover: () => this.showAbout(), onSelect: () => this.back() });
    this.setMenu(items, selected, 'ENTER: OPTIONS   ESC: DONE');
  }

  private setMenu(items: MenuItem[], selected: number, hint: string): void {
    this.menu?.destroy();
    const m = new Menu(this, 8, 32, items, INFO_X - 16);
    m.setScrollFactor(0).setDepth(700);
    this.menu = m;
    m.select(Math.max(0, Math.min(selected, items.length - 1)));
    this.hint?.destroy();
    this.hint = hintText(this, VIEW_H - 16, hint);
  }

  // ---------------------------------------------------------------------------
  // Actions for one mod

  private showActions(i: number, selected = 0): void {
    sfx.play('confirm');
    this.acting = i;
    const r = this.records[i];
    const on = this.choices.enabled.includes(r.mod.id);
    const hover = () => this.showMod(r);
    const items: MenuItem[] = [
      { label: on ? 'TURN OFF' : 'TURN ON', onHover: hover, onSelect: () => this.toggle(i) },
      { label: 'LOAD EARLIER', enabled: i > 0, onHover: hover, onSelect: () => this.move(i, -1) },
      { label: 'LOAD LATER', enabled: i < this.records.length - 1, onHover: hover, onSelect: () => this.move(i, 1) },
    ];
    if (r.origin === 'imported') items.push({ label: 'REMOVE', onHover: hover, onSelect: () => this.remove(i) });
    items.push({ label: 'BACK', onHover: hover, onSelect: () => this.backToList() });
    this.setMenu(items, selected, 'ESC: BACK');
    this.showMod(r);
  }

  private toggle(i: number): void {
    const id = this.records[i].mod.id;
    const on = this.choices.enabled.includes(id);
    this.choices.enabled = on ? this.choices.enabled.filter((e) => e !== id) : [...this.choices.enabled, id];
    this.changed();
    sfx.play(on ? 'cancel' : 'confirm');
    this.showActions(i, 0);
  }

  private move(i: number, dir: -1 | 1): void {
    const order = this.choices.order;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    this.changed();
    this.showActions(j, dir < 0 ? 1 : 2);
  }

  private remove(i: number): void {
    const mod = this.records[i].mod;
    removeImportedMod(mod.id);
    this.changed();
    sfx.play('cancel');
    this.flash(`REMOVED ${mod.name.toUpperCase()}`);
    this.showList(Math.min(i, this.records.length - 1));
  }

  private backToList(): void {
    sfx.play('cancel');
    this.showList(Math.max(0, this.acting));
  }

  private changed(): void {
    this.dirty = true;
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // Import

  private importFile(): void {
    // the picker can't report a cancel reliably, so just ignore repeated presses briefly
    if (this.time.now - this.pickedAt < 1000) return;
    this.pickedAt = this.time.now;
    sfx.play('confirm');
    pickModFile((json) => {
      if (this.scene.isActive()) this.imported(json);
    });
  }

  private imported(json: string): void {
    try {
      const mod = importMod(json);
      if (!this.choices.enabled.includes(mod.id)) this.choices.enabled.push(mod.id);
      this.changed();
      const i = this.records.findIndex((r) => r.mod.id === mod.id);
      this.showList(i);
      if (this.failures.has(mod.id)) {
        sfx.play('error');
        this.flash('IMPORTED, BUT IT HAS ERRORS', UI.bad);
      } else {
        sfx.play('build');
        this.flash(`IMPORTED ${mod.name.toUpperCase().slice(0, 40)}`);
      }
    } catch (e) {
      sfx.play('error');
      this.flash('COULD NOT IMPORT THAT FILE', UI.bad);
      this.showMessage('NOT A USABLE MOD', [e instanceof Error ? e.message : String(e)]);
    }
  }

  // ---------------------------------------------------------------------------
  // Info panel

  private showMod(r: ModRecord): void {
    const mod = r.mod;
    const lines: [string, number][] = [];
    const put = (str: string, color: number) => wrapText(str, INFO_COLS).forEach((l) => lines.push([l, color]));
    put(`v${mod.version}${mod.author ? ` by ${mod.author}` : ''}`, UI.textDim);
    if (mod.description) put(mod.description, UI.text);
    const summary = modSummary(mod);
    if (summary.length) put(summary.join(', '), UI.textDim);
    put(r.origin === 'imported' ? 'Imported from a file' : 'Comes with the game', UI.textDim);
    const failure = this.failures.get(mod.id);
    if (failure && this.choices.enabled.includes(mod.id)) {
      put('Not loaded:', UI.bad);
      for (const issue of failure.issues) put(`${issue.path}: ${issue.message}`, UI.text);
    }
    this.showPanel(mod.name.toUpperCase(), lines);
  }

  private showAbout(): void {
    const lines: [string, number][] = [];
    const put = (str: string, color: number) => wrapText(str, INFO_COLS).forEach((l) => lines.push([l, color]));
    if (this.records.length === 0) put('No mods yet.', UI.text);
    put('Mods add or change units, factions, terrain, maps and rules. Later mods in the list win when two change the same thing.', UI.text);
    put('Import a mod .json file to add it. See MODDING.md for how to make one.', UI.textDim);
    for (const e of bundleErrors) put(`${e.file}: ${e.message}`, UI.bad);
    // e.g. a map left out because a mod removed a unit it starts with
    for (const w of this.warnings) put(`${w.path}: ${w.message}`, UI.danger);
    this.showPanel('ABOUT MODS', lines);
  }

  private showMessage(title: string, messages: string[]): void {
    const lines: [string, number][] = [];
    for (const m of messages) wrapText(m, INFO_COLS).forEach((l) => lines.push([l, UI.text]));
    this.showPanel(title, lines);
  }

  private showPanel(title: string, lines: [string, number][]): void {
    this.info?.destroy();
    const shown = lines.length > INFO_MAX_LINES ? [...lines.slice(0, INFO_MAX_LINES - 1), ['...', UI.textDim] as [string, number]] : lines;
    const p = new Panel(this, INFO_X, 32, INFO_W, 10).setScrollFactor(0).setDepth(700);
    p.add(text(this, 8, 6, title.slice(0, INFO_COLS), UI.highlight));
    let y = 20;
    for (const [line, color] of shown) {
      p.add(text(this, 8, y, line, color));
      y += 10;
    }
    p.resize(INFO_W, y + 4);
    this.info = p;
  }

  private flash(msg: string, color = UI.good): void {
    if (!this.toast) return;
    this.toast.setText(msg).setTint(pal(color));
    this.toast.x = Math.round((VIEW_W - textWidth(msg)) / 2);
    this.tweens.killTweensOf(this.toast);
    this.toast.setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1800, duration: 400 });
  }

  // ---------------------------------------------------------------------------

  /** Leaves the screen, activating the new mod set if anything changed. */
  private back(): void {
    if (this.acting >= 0) {
      this.backToList();
      return;
    }
    if (this.dirty) {
      setModChoices(this.choices);
      activateMods(this.choices);
    }
    sfx.play('cancel');
    // the menu re-bakes sprites before it draws anything (this scene's sprites use them now)
    this.scene.start('Menu', { rebake: this.dirty });
  }
}
