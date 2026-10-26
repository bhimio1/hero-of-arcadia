// Fog of war. Each unit sees tiles within its vision range (plus the terrain's vision
// bonus); forest hides units from anyone not standing right next to them. Owned buildings
// always see their own tile. With fog off, everything is visible.

import { tilesInRange, toIndex } from './grid';
import { cloneState, terrainAt } from './state';
import { statsOf } from './stats';
import type { GameState, Unit } from './types';

/** Row-major visibility mask for `player` (true = visible). */
export function visibilityMask(state: GameState, player: number): boolean[] {
  const size = state.width * state.height;
  const mask = new Array<boolean>(size).fill(!state.options.fog);
  if (!state.options.fog) return mask;
  for (const u of state.units) {
    if (u.owner !== player) continue;
    const range = statsOf(state, u).vision + (terrainAt(state, u.x, u.y).visionBonus ?? 0);
    mask[toIndex(state.width, u.x, u.y)] = true;
    for (const t of tilesInRange(state.width, state.height, u, 1, range)) {
      const dist = Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
      if (terrainAt(state, t.x, t.y).hides && dist > 1) continue;
      mask[toIndex(state.width, t.x, t.y)] = true;
    }
  }
  for (const b of state.buildings) {
    if (b.owner === player) mask[toIndex(state.width, b.x, b.y)] = true;
  }
  return mask;
}

/** Whether `player` can see `unit` (own units are always visible). */
export function canSee(state: GameState, player: number, unit: Unit, mask = visibilityMask(state, player)): boolean {
  return unit.owner === player || mask[toIndex(state.width, unit.x, unit.y)];
}

/** Ids of enemy units `player` can currently see. */
export function visibleEnemyIds(state: GameState, player: number): Set<number> {
  const mask = visibilityMask(state, player);
  return new Set(state.units.filter((u) => u.owner !== player && mask[toIndex(state.width, u.x, u.y)]).map((u) => u.id));
}

/**
 * The game as `player` sees it: enemy units in the fog are removed, along with any capture
 * progress they have made. This is what AI players are given, so they cannot cheat.
 */
export function playerView(state: GameState, player: number): GameState {
  if (!state.options.fog) return state;
  const view = cloneState(state);
  const mask = visibilityMask(state, player);
  view.units = view.units.filter((u) => u.owner === player || mask[toIndex(state.width, u.x, u.y)]);
  const present = new Set(view.units.map((u) => u.id));
  for (const b of view.buildings) {
    if (b.capture && !present.has(b.capture.unitId)) b.capture = null;
  }
  return view;
}
