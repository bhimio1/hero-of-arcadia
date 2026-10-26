// Enumerates legal actions. Used by the AI, by tests that fuzz the rules, and as a
// reference for what the UI should offer.

import { targetsFrom } from './combat';
import { getBuildingDef, getUnitDef } from './data';
import { computeReach, destinations, pathTo } from './pathfinding';
import { buildingAt, unitAt } from './state';
import type { Action, GameState, Unit } from './types';

/** All actions available to one unit of the current player. */
export function unitActions(state: GameState, unit: Unit): Action[] {
  if (state.gameOver || unit.owner !== state.currentPlayer || unit.acted) return [];
  const out: Action[] = [];
  const def = getUnitDef(unit.type);
  if (!unit.moved) {
    const reach = computeReach(state, unit);
    for (const d of destinations(state, unit, reach)) {
      if (d.x === unit.x && d.y === unit.y) continue;
      const path = pathTo(reach, d);
      if (path) out.push({ type: 'move', unitId: unit.id, path });
    }
  }
  if (!unit.moved || def.moveAndFire) {
    for (const t of targetsFrom(state, unit, unit)) out.push({ type: 'attack', unitId: unit.id, targetId: t.id });
  }
  if (def.canCapture) {
    const b = buildingAt(state, unit.x, unit.y);
    if (b && b.owner !== unit.owner) out.push({ type: 'capture', unitId: unit.id });
  }
  out.push({ type: 'wait', unitId: unit.id });
  return out;
}

/** Build actions the current player can afford at a building. */
export function buildActions(state: GameState, buildingId: number): Action[] {
  const b = state.buildings.find((x) => x.id === buildingId);
  if (!b || state.gameOver || b.owner !== state.currentPlayer || unitAt(state, b.x, b.y)) return [];
  const gold = state.players[state.currentPlayer].gold;
  return getBuildingDef(b.type)
    .produces.filter((t) => getUnitDef(t).cost <= gold)
    .map((unitType) => ({ type: 'build', buildingId: b.id, unitType }));
}

/** Every legal action for the current player, ending with endTurn. */
export function listLegalActions(state: GameState): Action[] {
  if (state.gameOver) return [];
  const out: Action[] = [];
  for (const u of state.units) {
    if (u.owner === state.currentPlayer) out.push(...unitActions(state, u));
  }
  for (const b of state.buildings) out.push(...buildActions(state, b.id));
  out.push({ type: 'endTurn' });
  return out;
}
