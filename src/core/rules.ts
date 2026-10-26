// The single entry point for changing game state. Both the UI and the AI go through
// applyAction, so neither can bypass the rules. applyAction never mutates its input.

import { getUnitDef } from './data';
import { sameCoord } from './grid';
import { pathCost } from './pathfinding';
import { cloneState, getUnit, unitAt } from './state';
import type { Action, ActionResult, Coord, GameEvent, GameState, Unit } from './types';

class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg);
}

function requireOwnUnit(state: GameState, unitId: number): Unit {
  const unit = getUnit(state, unitId);
  if (!unit) fail(`no unit ${unitId}`);
  if (unit.owner !== state.currentPlayer) fail('not your unit');
  if (unit.acted) fail('unit has already acted');
  return unit;
}

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.gameOver) return { ok: false, error: 'game is over' };
  const next = cloneState(state);
  const events: GameEvent[] = [];
  try {
    switch (action.type) {
      case 'move':
        doMove(next, action.unitId, action.path, events);
        break;
      case 'wait':
        doWait(next, action.unitId, events);
        break;
      case 'endTurn':
        doEndTurn(next, events);
        break;
      default:
        fail(`unknown action ${(action as { type: string }).type}`);
    }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true, state: next, events };
}

/** Convenience for callers that know the action is legal (tests, replays). */
export function applyOrThrow(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`illegal action ${JSON.stringify(action)}: ${res.error}`);
  return res;
}

function doMove(state: GameState, unitId: number, path: Coord[], events: GameEvent[]): void {
  const unit = requireOwnUnit(state, unitId);
  if (unit.moved) fail('unit has already moved');
  if (!Array.isArray(path) || path.length < 2) fail('path too short');
  if (!sameCoord(path[0], unit)) fail('path must start at the unit');
  const def = getUnitDef(unit.type);
  const cost = pathCost(state, def.moveType, path);
  if (cost === null) fail('path is not walkable');
  if (cost > def.move) fail('path is too long');
  for (let i = 1; i < path.length; i++) {
    const other = unitAt(state, path[i].x, path[i].y);
    if (other && other.owner !== unit.owner) fail('path is blocked by an enemy');
  }
  const end = path[path.length - 1];
  const occupant = unitAt(state, end.x, end.y);
  if (occupant && occupant.id !== unit.id) fail('destination is occupied');
  unit.x = end.x;
  unit.y = end.y;
  unit.moved = true;
  events.push({ type: 'moved', unitId, path: path.map((c) => ({ x: c.x, y: c.y })) });
}

function doWait(state: GameState, unitId: number, events: GameEvent[]): void {
  const unit = requireOwnUnit(state, unitId);
  unit.moved = true;
  unit.acted = true;
  events.push({ type: 'waited', unitId });
}

function doEndTurn(state: GameState, events: GameEvent[]): void {
  for (const u of state.units) {
    if (u.owner === state.currentPlayer) {
      u.moved = false;
      u.acted = false;
    }
  }
  const n = state.players.length;
  let next = state.currentPlayer;
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n;
    if (next === 0) state.round += 1;
    if (!state.players[next].eliminated) break;
  }
  state.currentPlayer = next;
  startTurn(state, events);
}

/** Start-of-turn bookkeeping for state.currentPlayer. */
export function startTurn(state: GameState, events: GameEvent[]): void {
  for (const u of state.units) {
    if (u.owner === state.currentPlayer) {
      u.moved = false;
      u.acted = false;
    }
  }
  events.push({ type: 'turnStarted', player: state.currentPlayer, round: state.round });
}
