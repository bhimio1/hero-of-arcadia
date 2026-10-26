import paletteJson from '../../data/palette.json';
import { FACTIONS } from '../../core/data';

export type RGBA = [number, number, number, number];

export const PALETTE_HEX: string[] = paletteJson.colors;

export const PALETTE_RGB: [number, number, number][] = PALETTE_HEX.map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);

/** Darker palette index for each palette index (used for "already acted" units). */
export const DIM_MAP: number[] = paletteJson.dim;

/** Palette colour as a Phaser-style 0xRRGGBB number. */
export function pal(index: number): number {
  return parseInt(PALETTE_HEX[index].slice(1), 16);
}

export function palCss(index: number): string {
  return PALETTE_HEX[index];
}

export const UI = paletteJson.ui;

/** Team ramps by faction id, plus "neutral" for unowned buildings. */
export const TEAM_RAMPS: Record<string, [number, number, number]> = {};

/** Every team colour id (factions plus "neutral"); refreshed by syncTeamColors(). */
export const TEAM_IDS: string[] = [];

/** Rebuilds team colours from the active factions (call after content changes). */
export function syncTeamColors(): void {
  for (const k of Object.keys(TEAM_RAMPS)) delete TEAM_RAMPS[k];
  TEAM_RAMPS.neutral = paletteJson.neutralRamp as [number, number, number];
  for (const f of Object.values(FACTIONS)) TEAM_RAMPS[f.id] = f.ramp;
  TEAM_IDS.splice(0, TEAM_IDS.length, ...Object.keys(TEAM_RAMPS));
}
syncTeamColors();

/** Main (mid) colour of a faction, for UI accents. */
export function teamColor(faction: string): number {
  return pal(TEAM_RAMPS[faction][1]);
}

export function teamLight(faction: string): number {
  return pal(TEAM_RAMPS[faction][0]);
}
