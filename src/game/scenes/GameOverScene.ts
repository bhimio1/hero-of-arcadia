// Victory / defeat screen shown on top of the finished battle.

import Phaser from 'phaser';
import { getFaction } from '../../core/data';
import type { GameState } from '../../core/types';
import { VIEW_H, VIEW_W } from '../config';
import { sfx } from '../audio/sfx';
import { TEAM_RAMPS, UI } from '../gfx/palette';
import { Button, Panel, text, textWidth } from '../ui/widgets';

export interface GameOverData {
  state: GameState;
  /** Player the result is shown for (the human in a vs-AI game), or null for hot-seat. */
  viewer: number | null;
  onRematch: () => void;
  onMenu?: () => void;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    const { state, viewer } = data;
    // dither the battlefield behind the window
    const shade = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'dither-shade', 'a').setOrigin(0, 0);
    shade.setAlpha(1);

    const winner = state.winner;
    const won = viewer !== null && winner === viewer;
    let title: string;
    let color: number;
    if (winner === null) {
      title = 'DRAW';
      color = UI.text;
    } else if (viewer === null) {
      title = `${getFaction(state.players[winner].faction).name.toUpperCase()} WINS`;
      color = TEAM_RAMPS[state.players[winner].faction][0];
    } else {
      title = won ? 'VICTORY!' : 'DEFEAT';
      color = won ? UI.highlight : UI.bad;
    }
    sfx.play(viewer === null || won ? 'victory' : 'defeat');

    const w = 300;
    const rows = state.players.length;
    const h = 92 + rows * 11;
    const panel = new Panel(this, (VIEW_W - w) / 2, (VIEW_H - h) / 2 - 10, w, h);
    const big = text(this, 0, 10, title, color).setScale(2);
    big.x = Math.round((w - textWidth(title) * 2) / 2);
    panel.add(big);
    const after = `AFTER ${state.round} DAY${state.round === 1 ? '' : 'S'}`;
    panel.add(text(this, Math.round((w - textWidth(after)) / 2), 34, after, UI.textDim));

    const header = 'ARMY          KILLS  LOST';
    panel.add(text(this, 18, 52, header, UI.textDim));
    state.players.forEach((p, i) => {
      const name = getFaction(p.faction).short.toUpperCase().padEnd(14, ' ');
      const kills = String(p.stats.kills).padStart(5, ' ');
      const lost = String(p.stats.losses).padStart(6, ' ');
      panel.add(text(this, 18, 64 + i * 11, `${name}${kills}${lost}`, TEAM_RAMPS[p.faction][0]));
    });

    const by = panel.y + h - 24;
    new Button(this, panel.x + 20, by, 120, 'REMATCH', () => {
      sfx.play('confirm');
      data.onRematch();
    });
    if (data.onMenu) {
      new Button(this, panel.x + w - 140, by, 120, 'MAIN MENU', () => {
        sfx.play('confirm');
        data.onMenu?.();
      });
    }
    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 200 });
  }
}
