// Save / load screen with four slots (one autosave, three manual).

import Phaser from 'phaser';
import { getFaction, getMap } from '../../core/data';
import type { Match } from '../../core/match';
import { makeSave, SLOT_IDS, verifySave, type SaveData, type SlotId } from '../../core/save';
import { VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { pal, PALETTE_RGB, TEAM_RAMPS, UI } from '../gfx/palette';
import { bakeDither } from '../gfx/bake';
import { addBackdrop, minimapTexture } from '../render/Backdrop';
import { saves } from '../settings';
import { bindMenuKeys, Menu, Panel, text, textWidth, type MenuItem } from '../ui/widgets';

export interface SavesData {
  mode: 'save' | 'load';
  /** Scene to return to: the title menu, or a paused battle. */
  from: 'Menu' | 'Battle';
  /** The match to save (save mode). */
  match?: Match;
}

const SLOT_LABEL: Record<SlotId, string> = { auto: 'AUTOSAVE', slot1: 'SLOT 1', slot2: 'SLOT 2', slot3: 'SLOT 3' };

export class SavesScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private details: Panel | null = null;
  private toast: Phaser.GameObjects.BitmapText | null = null;
  private data_!: SavesData;

  constructor() {
    super('Saves');
  }

  create(data: SavesData): void {
    this.data_ = data;
    this.menu = null;
    this.details = null;
    if (data.from === 'Menu') {
      addBackdrop(this, 'wildwood');
    } else {
      bakeDither(this, 'dither-shade', PALETTE_RGB[1]);
      this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'dither-shade', 'a').setOrigin(0, 0);
    }
    const title = data.mode === 'save' ? 'SAVE GAME' : 'LOAD GAME';
    text(this, Math.round((VIEW_W - textWidth(title) * 2) / 2), 10, title, UI.highlight).setScale(2).setScrollFactor(0).setDepth(600);
    this.toast = text(this, 0, VIEW_H - 18, '', UI.good).setScrollFactor(0).setDepth(900);
    this.build();
    bindMenuKeys(this, () => this.menu, () => this.close());
  }

  private build(selected = -1): void {
    this.menu?.destroy();
    const list = saves.list();
    const items: MenuItem[] = list.map((slot) => {
      const save = slot.save;
      const detail = save ? save.label.toUpperCase().slice(0, 26) : slot.error ? 'DAMAGED' : 'EMPTY';
      const canUse = this.data_.mode === 'load' ? !!save : slot.id !== 'auto';
      return {
        label: SLOT_LABEL[slot.id],
        detail,
        enabled: canUse,
        onHover: () => this.showDetails(save),
        onSelect: () => (this.data_.mode === 'load' ? this.loadSave(save!) : this.saveTo(slot.id)),
      };
    });
    items.push({ label: 'BACK', onSelect: () => this.close(), onHover: () => this.showDetails(null) });
    const m = new Menu(this, 0, 36, items, 300);
    m.setPosition(Math.round((VIEW_W - m.boxW) / 2), 36).setScrollFactor(0).setDepth(700);
    this.menu = m;
    if (selected >= 0) m.select(selected);
  }

  private showDetails(save: SaveData | null): void {
    this.details?.destroy();
    this.details = null;
    if (!save) return;
    const map = getMap(save.snapshot.mapId);
    const key = minimapTexture(this, map.id, 2);
    const tex = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const w = 300;
    const h = Math.max(tex.height + 16, 64);
    const p = new Panel(this, Math.round((VIEW_W - w) / 2), 36 + this.menu!.boxH + 6, w, h).setScrollFactor(0).setDepth(700);
    p.add(this.add.image(8, 8, key).setOrigin(0, 0));
    const x = tex.width + 16;
    const when = new Date(save.savedAt);
    const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    p.add(text(this, x, 8, map.name.toUpperCase(), UI.highlight));
    p.add(text(this, x, 20, `DAY ${save.snapshot.round}`, UI.text));
    const cur = save.snapshot.players[save.snapshot.currentPlayer];
    p.add(text(this, x, 32, `${getFaction(cur.faction).short.toUpperCase()} TO MOVE`, TEAM_RAMPS[cur.faction][0]));
    p.add(text(this, x, 44, stamp, UI.textDim));
    this.details = p;
  }

  private saveTo(slot: SlotId): void {
    const match = this.data_.match;
    if (!match) return;
    try {
      saves.write(slot, makeSave(match));
      sfx.play('build');
      this.flash(`SAVED TO ${SLOT_LABEL[slot]}`);
      this.build(SLOT_IDS.indexOf(slot));
    } catch (e) {
      console.warn('save failed', e);
      sfx.play('error');
      this.flash('COULD NOT SAVE (STORAGE FULL?)', UI.bad);
    }
  }

  private loadSave(save: SaveData): void {
    if (!verifySave(save)) console.warn('save did not replay identically; loading its snapshot anyway');
    sfx.play('confirm');
    if (this.data_.from === 'Battle') {
      this.scene.stop('Hud');
      this.scene.stop('Battle');
    }
    this.scene.start('Battle', { save });
  }

  private flash(msg: string, color = UI.good): void {
    if (!this.toast) return;
    this.toast.setText(msg).setTint(pal(color));
    this.toast.x = Math.round((VIEW_W - textWidth(msg)) / 2);
    this.time.delayedCall(1800, () => this.toast?.setText(''));
  }

  private close(): void {
    sfx.play('cancel');
    if (this.data_.from === 'Battle') {
      this.scene.stop();
      this.scene.resume('Battle');
      this.scene.resume('Hud');
    } else {
      this.scene.start('Menu');
    }
  }
}
