// Menu backgrounds (a live battlefield slowly panning under a dither) and map thumbnails.

import Phaser from 'phaser';
import { getBuildingDef, getTerrain, parseMapTerrain } from '../../core/data';
import { statsOf } from '../../core/stats';
import type { MapDef } from '../../core/types';
import { createGame } from '../../core/state';
import { VIEW_H, VIEW_W } from '../config';
import { bakeDither } from '../gfx/bake';
import { PALETTE_HEX, PALETTE_RGB, TEAM_RAMPS } from '../gfx/palette';
import { BuildingLayer } from './BuildingLayer';
import { MapView } from './MapView';
import { UnitLayer } from './UnitLayer';

const PALETTE_HEX_INK = PALETTE_HEX[1];

/** Renders a map as scenery behind menus and pans the camera across it. */
export function addBackdrop(scene: Phaser.Scene, mapId: string): void {
  const state = createGame({ mapId, seed: 1 });
  const view = new MapView(scene, state);
  const teamOf = (o: number) => state.players[o].faction;
  new BuildingLayer(scene, teamOf).sync(state);
  new UnitLayer(scene, teamOf, (u) => statsOf(state, u).maxHp).sync(state);
  bakeDither(scene, 'dither-shade', PALETTE_RGB[1]);
  const shade = scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'dither-shade', 'a').setOrigin(0, 0).setScrollFactor(0).setDepth(500);
  shade.setAlpha(1);
  const cam = scene.cameras.main;
  cam.setBackgroundColor(PALETTE_HEX_INK);
  // maps smaller than the screen are centered; larger ones drift slowly from side to side
  const spanX = view.pixelWidth - VIEW_W;
  const spanY = view.pixelHeight - VIEW_H;
  const baseX = spanX < 0 ? Math.round(spanX / 2) : 0;
  const baseY = spanY < 0 ? Math.round(spanY / 2) : 0;
  cam.setScroll(baseX, baseY + Math.max(0, Math.round(spanY / 2)));
  const proxy = { t: 0 };
  scene.tweens.add({
    targets: proxy,
    t: 1,
    duration: 40000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      const x = spanX > 0 ? spanX * proxy.t : 0;
      const y = spanY > 0 ? spanY * (0.5 + 0.5 * Math.sin(proxy.t * Math.PI)) : 0;
      cam.setScroll(Math.round(baseX + x), Math.round(baseY + y));
    },
  });
}

/**
 * A small map thumbnail texture (`px` pixels per tile); returns its texture key. Armies are
 * coloured by `factions` (default: the map's own).
 */
export function minimapTexture(scene: Phaser.Scene, map: MapDef, px = 3, factions = map.players.map((p) => p.faction)): string {
  const key = `minimap-${map.id}-${px}-${factions.join('.')}`;
  if (scene.textures.exists(key)) return key;
  const { width, height, terrain } = parseMapTerrain(map);
  const tex = scene.textures.createCanvas(key, width * px, height * px);
  if (!tex) return key;
  const ctx = tex.getContext();
  const fill = (x: number, y: number, color: number, inset = 0) => {
    const [r, g, b] = PALETTE_RGB[color];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x * px + inset, y * px + inset, px - inset * 2, px - inset * 2);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) fill(x, y, getTerrain(terrain[y * width + x]).minimap ?? 10);
  }
  for (const b of map.buildings ?? []) {
    const ramp = b.owner === null ? TEAM_RAMPS.neutral : TEAM_RAMPS[factions[b.owner]];
    fill(b.x, b.y, getBuildingDef(b.type).hq ? ramp[0] : ramp[1]);
  }
  for (const u of map.units) fill(u.x, u.y, TEAM_RAMPS[factions[u.owner]][0], px > 2 ? 1 : 0);
  tex.refresh();
  return key;
}
