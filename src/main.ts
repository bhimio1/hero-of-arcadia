import '@fontsource/press-start-2p/latin-400.css';
import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './game/config';
import { computeZoom, installResizeHandler } from './game/display';
import { getSettings } from './game/settings';
import { BattleScene } from './game/scenes/BattleScene';
import { BootScene } from './game/scenes/BootScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { HelpScene } from './game/scenes/HelpScene';
import { HudScene } from './game/scenes/HudScene';
import { MenuScene } from './game/scenes/MenuScene';
import { ModsScene } from './game/scenes/ModsScene';
import { NewGameScene } from './game/scenes/NewGameScene';
import { SavesScene } from './game/scenes/SavesScene';
import { SettingsScene } from './game/scenes/SettingsScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: { mode: Phaser.Scale.NONE, zoom: computeZoom(getSettings().zoom) },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, MenuScene, NewGameScene, SavesScene, SettingsScene, HelpScene, ModsScene, BattleScene, HudScene, GameOverScene],
});

installResizeHandler(game);

// Exposed for debugging and automated smoke tests.
(window as unknown as { __game: Phaser.Game }).__game = game;
