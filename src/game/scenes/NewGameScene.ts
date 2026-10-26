// New game setup in two pages: first the battlefield, then the armies (faction and
// player/CPU for each) and battle options.

import Phaser from 'phaser';
import type { AiKind } from '../../core/ai';
import { FACTIONS, getFaction, MAPS } from '../../core/data';
import { describeFaction } from '../../core/describe';
import type { GameSetup, PlayerSetup } from '../../core/state';
import type { MapDef } from '../../core/types';
import { VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { TEAM_RAMPS, UI } from '../gfx/palette';
import { addBackdrop, minimapTexture } from '../render/Backdrop';
import { bindMenuKeys, hintText, Menu, optionItem, Panel, text, textWidth, wrapText, type MenuItem } from '../ui/widgets';

const DAY_LIMITS = [0, 15, 20, 30, 40] as const;
const AI_STYLES: readonly AiKind[] = ['greedy', 'cautious', 'reckless'];
const AI_LABEL: Record<AiKind, string> = { greedy: 'NORMAL', cautious: 'CAUTIOUS', reckless: 'RECKLESS' };

type Page = 'map' | 'armies';

interface Choices {
  mapId: string;
  factions: string[];
  controllers: ('human' | 'ai')[];
  fog: boolean;
  luck: boolean;
  dayLimit: number;
  aiStyle: AiKind;
}

let remembered: Choices | null = null;

const INFO_X = 252;
const INFO_W = VIEW_W - INFO_X - 8;

export class NewGameScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private info: Panel | null = null;
  private title: Phaser.GameObjects.BitmapText | null = null;
  private hint: Phaser.GameObjects.Container | null = null;
  private choices!: Choices;
  private page: Page = 'map';

  constructor() {
    super('NewGame');
  }

  create(): void {
    addBackdrop(this, 'wildwood');
    const valid = remembered && remembered.mapId in MAPS && remembered.factions.every((f) => f in FACTIONS);
    this.choices = valid ? { ...remembered!, factions: [...remembered!.factions], controllers: [...remembered!.controllers] } : this.defaultsFor(this.mapIds()[0]);
    this.page = 'map';
    this.show();
    bindMenuKeys(this, () => this.menu, () => this.back());
  }

  private mapIds(): string[] {
    return Object.keys(MAPS);
  }

  private get map(): MapDef {
    return MAPS[this.choices.mapId];
  }

  private defaultsFor(mapId: string, keep?: Choices): Choices {
    const map = MAPS[mapId];
    return {
      mapId,
      factions: map.players.map((p) => p.faction),
      controllers: map.players.map((p, i) => keep?.controllers[i] ?? p.controller),
      fog: map.fog ?? false,
      luck: keep?.luck ?? false,
      dayLimit: map.dayLimit ?? keep?.dayLimit ?? 0,
      aiStyle: keep?.aiStyle ?? 'greedy',
    };
  }

  private show(selected = 0): void {
    this.menu?.destroy();
    this.title?.destroy();
    this.hint?.destroy();
    const heading = this.page === 'map' ? 'NEW GAME: BATTLEFIELD' : 'NEW GAME: ARMIES';
    this.title = text(this, Math.round((VIEW_W - textWidth(heading) * 2) / 2), 8, heading, UI.highlight).setScale(2).setScrollFactor(0).setDepth(600);
    const items = this.page === 'map' ? this.mapItems() : this.armyItems();
    const m = new Menu(this, 8, 32, items, INFO_X - 16);
    m.setScrollFactor(0).setDepth(700);
    this.menu = m;
    m.select(Math.min(selected, items.length - 1));
    const hint = this.page === 'map' ? 'LEFT/RIGHT: CHANGE MAP   ENTER: NEXT' : 'LEFT/RIGHT: FACTION   ENTER: PLAYER/CPU';
    this.hint = hintText(this, VIEW_H - 16, hint);
    if (this.page === 'map') this.showMapInfo();
  }

  // ---------------------------------------------------------------------------
  // Page 1: battlefield

  private mapItems(): MenuItem[] {
    const c = this.choices;
    const ids = this.mapIds();
    const items: MenuItem[] = [
      optionItem('MAP', ids, c.mapId, (id) => MAPS[id].name.toUpperCase(), (id) => {
        this.choices = this.defaultsFor(id, this.choices);
        this.showMapInfo();
      }, () => this.menu, () => 0),
    ];
    items.push({ label: 'NEXT: ARMIES', onSelect: () => this.goto('armies') });
    items.push({ label: 'BACK', onSelect: () => this.back() });
    return items;
  }

  private showMapInfo(): void {
    this.info?.destroy();
    const map = this.map;
    const key = minimapTexture(this, map, 3);
    const tex = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const lines = wrapText(map.description, 25);
    const h = 16 + tex.height + 10 + lines.length * 10 + 26;
    const p = new Panel(this, INFO_X, 32, INFO_W, h).setScrollFactor(0).setDepth(700);
    p.add(text(this, 8, 6, map.name.toUpperCase(), UI.highlight));
    p.add(this.add.image(Math.round((INFO_W - tex.width) / 2), 18, key).setOrigin(0, 0));
    let y = 18 + tex.height + 6;
    for (const l of lines) {
      p.add(text(this, 8, y, l, UI.text));
      y += 10;
    }
    y += 4;
    p.add(text(this, 8, y, `${map.rows[0].length}X${map.rows.length}  ${map.players.length} ARMIES${map.fog ? '  FOG' : ''}`, UI.textDim));
    let fx = 8;
    y += 10;
    this.choices.factions.forEach((f) => {
      const name = getFaction(f).short.toUpperCase();
      p.add(text(this, fx, y, name, TEAM_RAMPS[f][0]));
      fx += textWidth(name) + 8;
    });
    this.info = p;
  }

  // ---------------------------------------------------------------------------
  // Page 2: armies and options

  private armyLabel(i: number): string {
    const f = getFaction(this.choices.factions[i]);
    return `${f.short.toUpperCase()} ${this.choices.controllers[i] === 'human' ? 'PLAYER' : 'CPU'}`;
  }

  /** Next faction (in `dir`) not already taken by another army. */
  private cycleFaction(i: number, dir: number): void {
    const all = Object.keys(FACTIONS);
    const taken = new Set(this.choices.factions.filter((_, j) => j !== i));
    let k = all.indexOf(this.choices.factions[i]);
    for (let n = 0; n < all.length; n++) {
      k = (k + dir + all.length) % all.length;
      if (!taken.has(all[k])) break;
    }
    this.choices.factions[i] = all[k];
    this.menu?.setDetail(i, this.armyLabel(i));
    this.showFaction(i);
  }

  private armyItems(): MenuItem[] {
    const c = this.choices;
    const items: MenuItem[] = this.map.players.map((_, i) => ({
      label: `ARMY ${i + 1}`,
      detail: this.armyLabel(i),
      onHover: () => this.showFaction(i),
      onLeft: () => this.cycleFaction(i, -1),
      onRight: () => this.cycleFaction(i, 1),
      onSelect: () => {
        c.controllers[i] = c.controllers[i] === 'human' ? 'ai' : 'human';
        this.menu?.setDetail(i, this.armyLabel(i));
        sfx.play('cursor');
      },
    }));
    const n = items.length;
    const row = (k: number) => () => n + k;
    const optionsInfo = () => this.showOptionsInfo();
    const withInfo = (item: MenuItem): MenuItem => ({ ...item, onHover: optionsInfo });
    items.push(withInfo(optionItem('FOG OF WAR', [false, true], c.fog, (v) => (v ? 'ON' : 'OFF'), (v) => (c.fog = v), () => this.menu, row(0))));
    items.push(withInfo(optionItem('LUCK', [false, true], c.luck, (v) => (v ? 'ON' : 'OFF'), (v) => (c.luck = v), () => this.menu, row(1))));
    items.push(withInfo(optionItem('DAY LIMIT', DAY_LIMITS, c.dayLimit as (typeof DAY_LIMITS)[number], (v) => (v === 0 ? 'NONE' : `${v}`), (v) => (c.dayLimit = v), () => this.menu, row(2))));
    items.push(withInfo(optionItem('CPU STYLE', AI_STYLES, c.aiStyle, (v) => AI_LABEL[v], (v) => (c.aiStyle = v), () => this.menu, row(3))));
    items.push({ label: 'START BATTLE', onSelect: () => this.start(), onHover: optionsInfo });
    items.push({ label: 'BACK', onSelect: () => this.goto('map'), onHover: optionsInfo });
    return items;
  }

  private showFaction(i: number): void {
    this.info?.destroy();
    const f = getFaction(this.choices.factions[i]);
    const p = new Panel(this, INFO_X, 32, INFO_W, 10).setScrollFactor(0).setDepth(700);
    p.add(text(this, 8, 6, f.name.toUpperCase(), TEAM_RAMPS[f.id][0]));
    let y = 18;
    const put = (str: string, color: number) => {
      for (const line of wrapText(str, 25)) {
        p.add(text(this, 8, y, line, color));
        y += 10;
      }
    };
    if (f.blurb) put(f.blurb, UI.textDim);
    y += 3;
    for (const line of describeFaction(f)) {
      put(line, UI.text);
      y += 3;
    }
    p.resize(INFO_W, y + 4);
    this.info = p;
  }

  private showOptionsInfo(): void {
    this.info?.destroy();
    const lines = [
      'FOG: SEE ONLY WHAT YOUR UNITS SEE.',
      'LUCK: STRIKES MAY DEAL 1 EXTRA DAMAGE.',
      'DAY LIMIT: BEST SCORE WINS WHEN TIME RUNS OUT.',
      'CPU STYLE: HOW CAREFULLY COMPUTER ARMIES PLAY.',
    ];
    const p = new Panel(this, INFO_X, 32, INFO_W, 10).setScrollFactor(0).setDepth(700);
    let y = 6;
    for (const l of lines) {
      for (const w of wrapText(l, 25)) {
        p.add(text(this, 8, y, w, UI.text));
        y += 10;
      }
      y += 4;
    }
    p.resize(INFO_W, y + 2);
    this.info = p;
  }

  private goto(page: Page): void {
    sfx.play(page === 'armies' ? 'confirm' : 'cancel');
    this.page = page;
    this.show(0);
    if (page === 'armies') this.showFaction(0);
  }

  private start(): void {
    const c = this.choices;
    remembered = { ...c, factions: [...c.factions], controllers: [...c.controllers] };
    const players: PlayerSetup[] = this.map.players.map((_, i) => ({ faction: c.factions[i], controller: c.controllers[i] }));
    const setup: GameSetup = {
      mapId: c.mapId,
      seed: Math.floor(Math.random() * 2 ** 31),
      players,
      fog: c.fog,
      luck: c.luck,
      dayLimit: c.dayLimit,
      aiStyle: c.aiStyle,
    };
    sfx.play('confirm');
    this.scene.start('Battle', { setup });
  }

  private back(): void {
    if (this.page === 'armies') {
      this.goto('map');
      return;
    }
    sfx.play('cancel');
    this.scene.start('Menu');
  }
}
