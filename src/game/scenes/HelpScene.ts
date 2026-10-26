// "How to play": a few pages of rules. Unit and terrain pages are generated from the data
// files so they never drift from the actual numbers.

import Phaser from 'phaser';
import { BUILDINGS, TERRAIN, UNITS } from '../../core/data';
import { VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { unitTextureKey } from '../gfx/bake';
import { UI } from '../gfx/palette';
import { addBackdrop } from '../render/Backdrop';
import { bindMenuKeys, hintText, Panel, text, textWidth, wrapText } from '../ui/widgets';

interface Page {
  title: string;
  lines?: string[];
  build?: (scene: HelpScene, panel: Panel) => void;
}

const COLS = 52;

const PAGES: Page[] = [
  {
    title: 'THE GOAL',
    lines: [
      'Capture the enemy KEEP with a pikeman or shieldbearer, or destroy every unit they have (and leave them no barracks).',
      'Some battles have a day limit: when it runs out, the army with the best score (unit value plus 100 per building) wins.',
    ],
  },
  {
    title: 'A TURN',
    lines: [
      'Each day every army takes one turn. Click a unit: blue tiles show where it can go, red tiles what it could strike.',
      'Pick a tile to move, then choose ATTACK, CAPTURE or WAIT. Esc or Ctrl+Z takes back a move until the unit acts.',
      'Click your barracks to raise a new unit (it can act next turn). Press Space or END TURN when you are done.',
    ],
  },
  {
    title: 'COMBAT',
    lines: [
      'Damage = attack x matchup bonus x attacker health x (1 - 10% per point of defense). Terrain adds to defense.',
      'A defender that survives strikes back if the attacker is within its range. Archers, catapults and battlemages',
      'hitting from 2+ tiles take no reply from melee units. Catapults cannot move and fire in the same turn.',
      'The preview window shows the result before you commit. With LUCK on, each strike may deal 1 extra damage.',
    ],
  },
  {
    title: 'UNITS',
    build: (scene, panel) => {
      let y = 22;
      panel.add(text(scene, 30, y, 'NAME          COST HP ATK DEF MOV RNG SEE', UI.textDim));
      y += 11;
      for (const u of Object.values(UNITS)) {
        panel.add(scene.add.sprite(8, y - 5, unitTextureKey(u.id, 'cobalt'), 'idle0').setOrigin(0, 0));
        const rng = u.range[0] === u.range[1] ? `${u.range[0]}` : `${u.range[0]}-${u.range[1]}`;
        const row = `${u.name.toUpperCase().padEnd(13)} ${String(u.cost).padStart(4)} ${String(u.maxHp).padStart(2)} ${String(u.attack).padStart(3)} ${String(u.defense).padStart(3)} ${String(u.move).padStart(3)} ${rng.padStart(3)} ${String(u.vision).padStart(3)}`;
        panel.add(text(scene, 30, y, row, UI.text));
        y += 18;
      }
    },
  },
  {
    title: 'TERRAIN AND BUILDINGS',
    build: (scene, panel) => {
      let y = 22;
      panel.add(text(scene, 10, y, 'TERRAIN   DEF  FOOT RIDE WHEEL', UI.textDim));
      y += 11;
      const cost = (v: number | undefined) => (v === undefined ? '-' : String(v));
      for (const t of Object.values(TERRAIN)) {
        const row = `${t.name.toUpperCase().padEnd(9)} ${(t.defense >= 0 ? '+' : '') + t.defense}`.padEnd(15) +
          `${cost(t.moveCost.foot).padStart(3)}  ${cost(t.moveCost.mounted).padStart(3)}  ${cost(t.moveCost.wheeled).padStart(3)}`;
        panel.add(text(scene, 10, y, row, UI.text));
        y += 10;
      }
      y += 4;
      panel.add(text(scene, 10, y, 'BUILDING  DEF  GOLD  NOTES', UI.textDim));
      y += 11;
      for (const b of Object.values(BUILDINGS)) {
        const note = b.hq ? 'LOSE IT, LOSE THE WAR' : b.produces.length ? 'RAISES TROOPS' : 'HEALS +2 HP';
        panel.add(text(scene, 10, y, `${b.name.toUpperCase().padEnd(9)} +${b.defense}   ${String(b.income).padStart(3)}  ${note}`, UI.text));
        y += 10;
      }
    },
  },
  {
    title: 'FOG OF WAR',
    lines: [
      'With fog on you only see what your units see. Hills (+1) and mountains (+2) extend sight; scouts see furthest.',
      'Forests hide units from anyone not standing right next to them. Walking into a hidden enemy is an AMBUSH:',
      'the move stops short and that unit is done for the turn. A move that spots the enemy cannot be taken back.',
    ],
  },
  {
    title: 'CONTROLS',
    lines: [
      'Mouse: click to select, move and attack. Drag, arrows or WASD pan the map. Click an enemy to see its reach.',
      'Space: end turn. Tab: next ready unit (or next target while aiming). Enter: confirm. Esc / right click: cancel',
      'or undo a move. Ctrl+Z: undo a move. Esc with nothing selected opens the pause menu (save, load, settings).',
    ],
  },
];

export class HelpScene extends Phaser.Scene {
  private page = 0;
  private panel: Panel | null = null;

  constructor() {
    super('Help');
  }

  create(): void {
    this.page = 0;
    addBackdrop(this, 'wildwood');
    hintText(this, VIEW_H - 24, 'LEFT/RIGHT OR CLICK: PAGE   ESC: BACK');
    this.show();
    const kb = this.input.keyboard!;
    const flip = (d: number) => () => {
      this.page = (this.page + d + PAGES.length) % PAGES.length;
      sfx.play('cursor');
      this.show();
    };
    kb.on('keydown-RIGHT', flip(1));
    kb.on('keydown-D', flip(1));
    kb.on('keydown-SPACE', flip(1));
    kb.on('keydown-ENTER', flip(1));
    kb.on('keydown-LEFT', flip(-1));
    kb.on('keydown-A', flip(-1));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => (p.x < VIEW_W / 3 ? flip(-1) : flip(1))());
    bindMenuKeys(this, () => null, () => {
      sfx.play('cancel');
      this.scene.start('Menu');
    });
  }

  private show(): void {
    this.panel?.destroy();
    const pg = PAGES[this.page];
    const w = VIEW_W - 24;
    const h = VIEW_H - 40;
    const p = new Panel(this, 12, 10, w, h).setScrollFactor(0).setDepth(700);
    const title = `${pg.title}  (${this.page + 1}/${PAGES.length})`;
    p.add(text(this, Math.round((w - textWidth(title)) / 2), 8, title, UI.highlight));
    if (pg.lines) {
      let y = 26;
      for (const para of pg.lines) {
        for (const line of wrapText(para, COLS)) {
          p.add(text(this, 12, y, line, UI.text));
          y += 11;
        }
        y += 6;
      }
    }
    pg.build?.(this, p);
    this.panel = p;
  }
}
