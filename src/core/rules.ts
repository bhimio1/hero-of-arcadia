// The single entry point for changing game state. Both the UI and the AI go through
// applyAction, so neither can bypass the rules. applyAction never mutates its input.

import { baseDamage, canCounter, inAttackRange, LUCK_MAX } from './combat';
import { getUnitDef } from './data';
import { sameCoord } from './grid';
import { pathCost } from './pathfinding';
import { Rng } from './rng';
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
      case 'attack':
        doAttack(next, action.unitId, action.targetId, events);
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
  checkVictory(next, events);
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

function strike(state: GameState, attacker: Unit, defender: Unit, counter: boolean, rng: Rng, events: GameEvent[]): void {
  let damage = baseDamage(state, attacker, attacker.hp, defender);
  if (state.options.luck) damage += rng.int(0, LUCK_MAX);
  defender.hp = Math.max(0, defender.hp - damage);
  events.push({ type: 'attacked', attackerId: attacker.id, defenderId: defender.id, damage, counter, hpAfter: defender.hp });
  if (defender.hp <= 0) {
    state.units = state.units.filter((u) => u.id !== defender.id);
    state.players[attacker.owner].stats.kills += 1;
    state.players[defender.owner].stats.losses += 1;
    events.push({ type: 'died', unitId: defender.id, owner: defender.owner, x: defender.x, y: defender.y });
  }
}

function doAttack(state: GameState, unitId: number, targetId: number, events: GameEvent[]): void {
  const unit = requireOwnUnit(state, unitId);
  const def = getUnitDef(unit.type);
  if (unit.moved && !def.moveAndFire) fail(`${def.name} cannot move and attack in the same turn`);
  const target = getUnit(state, targetId);
  if (!target) fail(`no unit ${targetId}`);
  if (target.owner === unit.owner) fail('cannot attack your own unit');
  if (!inAttackRange(unit, unit, target)) fail('target out of range');
  const rng = new Rng(state.rng);
  strike(state, unit, target, false, rng, events);
  if (target.hp > 0 && canCounter(target, unit)) strike(state, target, unit, true, rng, events);
  state.rng = rng.state;
  unit.moved = true;
  unit.acted = true;
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

/**
 * Eliminates players with no units left and ends the game when one player remains.
 * If the current player was eliminated mid-turn, play passes on.
 */
export function checkVictory(state: GameState, events: GameEvent[]): void {
  if (state.gameOver) return;
  state.players.forEach((p, i) => {
    if (p.eliminated) return;
    if (!state.units.some((u) => u.owner === i)) {
      p.eliminated = true;
      events.push({ type: 'eliminated', player: i });
    }
  });
  const alive = state.players.map((p, i) => (p.eliminated ? -1 : i)).filter((i) => i >= 0);
  if (alive.length <= 1) {
    state.gameOver = true;
    state.winner = alive.length === 1 ? alive[0] : null;
    events.push({ type: 'gameOver', winner: state.winner });
    return;
  }
  if (state.players[state.currentPlayer].eliminated) doEndTurn(state, events);
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
