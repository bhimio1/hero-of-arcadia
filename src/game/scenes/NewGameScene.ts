// New game setup: map, who controls each army, and battle options.

import Phaser from 'phaser';
import type { AiKind } from '../../core/ai';
import { getFaction, MAPS } from '../../core/data';
import type { GameSetup, PlayerSetup } from '../../core/state';
import { VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { TEAM_RAMPS, UI } from '../gfx/palette';
import { addBackdrop, minimapTexture } from '../render/Backdrop';
import { bindMenuKeys, Menu, optionItem, Panel, text, textWidth, wrapText, type MenuItem } from '../ui/widgets';

const MAP_IDS = Object.keys(MAPS);
const DAY_LIMITS = [0, 15, 20, 30, 40] as const;
const AI_STYLES: readonly AiKind[] = ['greedy', 'cautious', 'reckless'];
const AI_LABEL: Record<AiKind, string> = { greedy: 'NORMAL', cautious: 'CAUTIOUS', reckless: 'RECKLESS' };

interface Choices {
  mapId: string;
  controllers: ('human' | 'ai')[];
  fog: boolean;
  luck: boolean;
  dayLimit: number;
  aiStyle: AiKind;
}

let remembered: Choices | null = null;

export class NewGameScene extends Phaser.Scene {
  private menu: Menu | null = null;
  private info: Panel | null = null;
  private choices!: Choices;

  constructor() {
    super('NewGame');
  }

  create(): void {
    addBackdrop(this, 'first-ford');
    const title = 'NEW GAME';
    text(this, Math.round((VIEW_W - textWidth(title) * 2) / 2), 8, title, UI.highlight).setScale(2).setScrollFactor(0).setDepth(600);
    this.choices = remembered ? { ...remembered } : this.defaultsFor(MAP_IDS[0]);
    this.buildMenu();
    bindMenuKeys(this, () => this.menu, () => this.back());
  }

  private defaultsFor(mapId: string, keep?: Choices): Choices {
    const map = MAPS[mapId];
    return {
      mapId,
      controllers: map.players.map((p, i) => keep?.controllers[i] ?? p.controller),
      fog: keep?.fog ?? map.fog ?? false,
      luck: keep?.luck ?? false,
      dayLimit: keep?.dayLimit ?? map.dayLimit ?? 0,
      aiStyle: keep?.aiStyle ?? 'greedy',
    };
  }

  private buildMenu(selected = 0): void {
    this.menu?.destroy();
    const c = this.choices;
    const map = MAPS[c.mapId];
    const items: MenuItem[] = [];
    const idx = (i: number) => () => i;
    items.push(
      optionItem('MAP', MAP_IDS, c.mapId, (id) => MAPS[id].name.toUpperCase(), (id) => {
        this.choices = this.defaultsFor(id, { ...this.choices, controllers: [] });
        this.buildMenu(0);
      }, () => this.menu, idx(0)),
    );
    map.players.forEach((p, i) => {
      const faction = getFaction(p.faction);
      items.push(
        optionItem(faction.name.toUpperCase(), ['human', 'ai'] as const, c.controllers[i], (v) => (v === 'human' ? 'PLAYER' : 'CPU'), (v) => {
          this.choices.controllers[i] = v;
        }, () => this.menu, idx(items.length)),
      );
    });
    const n = items.length;
    items.push(optionItem('FOG OF WAR', [false, true], c.fog, (v) => (v ? 'ON' : 'OFF'), (v) => (this.choices.fog = v), () => this.menu, idx(n)));
    items.push(optionItem('LUCK', [false, true], c.luck, (v) => (v ? 'ON' : 'OFF'), (v) => (this.choices.luck = v), () => this.menu, idx(n + 1)));
    items.push(optionItem('DAY LIMIT', DAY_LIMITS, c.dayLimit as (typeof DAY_LIMITS)[number], (v) => (v === 0 ? 'NONE' : `${v}`), (v) => (this.choices.dayLimit = v), () => this.menu, idx(n + 2)));
    items.push(optionItem('CPU STYLE', AI_STYLES, c.aiStyle, (v) => AI_LABEL[v], (v) => (this.choices.aiStyle = v), () => this.menu, idx(n + 3)));
    items.push({ label: 'START BATTLE', onSelect: () => this.start() });
    items.push({ label: 'BACK', onSelect: () => this.back() });
    const m = new Menu(this, 8, 32, items, 236);
    m.setScrollFactor(0).setDepth(700);
    this.menu = m;
    m.select(Math.min(selected, items.length - 1));
    this.showMapInfo();
  }

  private showMapInfo(): void {
    this.info?.destroy();
    const map = MAPS[this.choices.mapId];
    const key = minimapTexture(this, map.id, 3);
    const tex = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const w = 216;
    const x = VIEW_W - w - 8;
    const lines = wrapText(map.description, 25);
    const h = 16 + tex.height + 10 + lines.length * 10 + 26;
    const p = new Panel(this, x, 32, w, h).setScrollFactor(0).setDepth(700);
    p.add(text(this, 8, 6, map.name.toUpperCase(), UI.highlight));
    const img = this.add.image(Math.round((w - tex.width) / 2), 18, key).setOrigin(0, 0);
    p.add(img);
    let y = 18 + tex.height + 6;
    for (const l of lines) {
      p.add(text(this, 8, y, l, UI.text));
      y += 10;
    }
    y += 4;
    const size = `${map.rows[0].length}X${map.rows.length}  ${map.players.length} ARMIES`;
    p.add(text(this, 8, y, size, UI.textDim));
    let fx = 8;
    y += 10;
    map.players.forEach((pl) => {
      const f = getFaction(pl.faction).short.toUpperCase();
      p.add(text(this, fx, y, f, TEAM_RAMPS[pl.faction][0]));
      fx += textWidth(f) + 8;
    });
    this.info = p;
  }

  private start(): void {
    const c = this.choices;
    remembered = { ...c, controllers: [...c.controllers] };
    const map = MAPS[c.mapId];
    const players: PlayerSetup[] = map.players.map((p, i) => ({ faction: p.faction, controller: c.controllers[i] }));
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
    sfx.play('cancel');
    this.scene.start('Menu');
  }
}
