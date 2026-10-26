// Screen-space UI drawn on top of the battle: turn indicator, tile/unit info and buttons.
// It runs as its own scene so its camera never scrolls with the map.

import Phaser from 'phaser';
import { getUnitDef } from '../../core/data';
import type { TerrainDef, Unit } from '../../core/types';
import { VIEW_H, VIEW_W } from '../config';
import { UI } from '../gfx/palette';
import { Button, Panel, text } from '../ui/widgets';

export interface HudCallbacks {
  onEndTurn: () => void;
}

export class HudScene extends Phaser.Scene {
  private turnPanel!: Panel;
  private turnText!: Phaser.GameObjects.BitmapText;
  private infoPanel!: Panel;
  private infoLines: Phaser.GameObjects.BitmapText[] = [];
  private endTurnBtn!: Button;
  private callbacks!: HudCallbacks;
  /** Screen rectangles that swallow clicks so they don't reach the map. */
  private blockers: { contains: (x: number, y: number) => boolean }[] = [];

  constructor() {
    super('Hud');
  }

  init(data: { callbacks: HudCallbacks }): void {
    this.callbacks = data.callbacks;
    this.blockers = [];
    this.infoLines = [];
  }

  create(): void {
    this.turnPanel = new Panel(this, 4, 4, 136, 18);
    this.turnText = text(this, 8, 5, '');
    this.turnPanel.add(this.turnText);
    this.blockers.push({ contains: (x, y) => this.turnPanel.containsScreen(x, y) });

    this.infoPanel = new Panel(this, 4, VIEW_H - 40, 152, 36);
    for (let i = 0; i < 3; i++) {
      const t = text(this, 6, 5 + i * 9, '');
      this.infoLines.push(t);
      this.infoPanel.add(t);
    }
    this.blockers.push({ contains: (x, y) => this.infoPanel.containsScreen(x, y) });

    this.endTurnBtn = new Button(this, VIEW_W - 84, VIEW_H - 22, 80, 'END TURN', () => this.callbacks.onEndTurn());
    this.blockers.push({ contains: (x, y) => this.endTurnBtn.visible && x >= this.endTurnBtn.x && y >= this.endTurnBtn.y && x < this.endTurnBtn.x + this.endTurnBtn.boxW && y < this.endTurnBtn.y + this.endTurnBtn.boxH });
  }

  isOverUI(x: number, y: number): boolean {
    return this.blockers.some((b) => b.contains(x, y));
  }

  setTurn(round: number, factionShort: string, color: number): void {
    this.turnText.setText(`DAY ${round} ${factionShort.toUpperCase()}`);
    this.turnText.setTint(color);
    this.turnPanel.resize(Math.max(80, this.turnText.text.length * 8 + 12), 18);
  }

  setInfo(terrain: TerrainDef | null, unit: Unit | null): void {
    const lines: string[] = [];
    if (unit) {
      const def = getUnitDef(unit.type);
      lines.push(`${def.name.toUpperCase()} ${Math.ceil(unit.hp)}/${def.maxHp}`);
    }
    if (terrain) lines.push(`${terrain.name.toUpperCase()}`);
    this.infoLines.forEach((t, i) => {
      t.setText(lines[i] ?? '');
      t.setTint(i === 0 && unit ? 0xffffff : 0xcbdbfc);
    });
    this.infoPanel.setVisible(lines.length > 0);
    this.infoPanel.resize(Math.max(64, Math.max(...lines.map((l) => l.length)) * 8 + 12), lines.length * 9 + 9);
    this.infoPanel.y = VIEW_H - this.infoPanel.boxH - 4;
  }

  setEndTurnEnabled(on: boolean): void {
    this.endTurnBtn.setEnabled(on);
  }

  get palette(): typeof UI {
    return UI;
  }
}
