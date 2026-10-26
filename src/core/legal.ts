// Enumerates legal actions. Used by the AI, by tests that fuzz the rules, and as a
// reference for what the UI should offer.

import { targetsFrom } from './combat';
import { getUnitDef } from './data';
import { computeReach, destinations, pathTo } from './pathfinding';
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
  out.push({ type: 'wait', unitId: unit.id });
  return out;
}

/** Every legal action for the current player, ending with endTurn. */
export function listLegalActions(state: GameState): Action[] {
  if (state.gameOver) return [];
  const out: Action[] = [];
  for (const u of state.units) {
    if (u.owner === state.currentPlayer) out.push(...unitActions(state, u));
  }
  out.push({ type: 'endTurn' });
  return out;
}
