import '@fontsource/press-start-2p/latin-400.css';
import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './game/config';
import { computeZoom, installResizeHandler } from './game/display';
import { BattleScene } from './game/scenes/BattleScene';
import { BootScene } from './game/scenes/BootScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { HudScene } from './game/scenes/HudScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: { mode: Phaser.Scale.NONE, zoom: computeZoom('auto') },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, BattleScene, HudScene, GameOverScene],
});

installResizeHandler(game);

// Exposed for debugging and automated smoke tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
