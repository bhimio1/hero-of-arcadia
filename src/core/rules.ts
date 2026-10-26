// The single entry point for changing game state. Both the UI and the AI go through
// applyAction, so neither can bypass the rules. applyAction never mutates its input.

import { baseDamage, canCounter, inAttackRange, LUCK_MAX } from './combat';
import { getBuildingDef, getUnitDef } from './data';
import { sameCoord } from './grid';
import { pathCost } from './pathfinding';
import { Rng } from './rng';
import { buildingAt, cloneState, getBuilding, getUnit, incomeOf, scoreOf, unitAt } from './state';
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
      case 'capture':
        doCapture(next, action.unitId, events);
        break;
      case 'build':
        doBuild(next, action.buildingId, action.unitType, events);
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
  // walking off a building abandons any capture in progress there
  for (const b of state.buildings) {
    if (b.capture?.unitId === unit.id && (b.x !== unit.x || b.y !== unit.y)) b.capture = null;
  }
  events.push({ type: 'moved', unitId, path: path.map((c) => ({ x: c.x, y: c.y })) });
}

function strike(state: GameState, attacker: Unit, defender: Unit, counter: boolean, rng: Rng, events: GameEvent[]): void {
  let damage = baseDamage(state, attacker, attacker.hp, defender);
  if (state.options.luck) damage += rng.int(0, LUCK_MAX);
  defender.hp = Math.max(0, defender.hp - damage);
  events.push({ type: 'attacked', attackerId: attacker.id, defenderId: defender.id, damage, counter, hpAfter: defender.hp });
  if (defender.hp <= 0) {
    state.units = state.units.filter((u) => u.id !== defender.id);
    for (const b of state.buildings) if (b.capture?.unitId === defender.id) b.capture = null;
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

/** Capture strength: healthy units capture twice as fast as badly wounded ones. */
export function captureStrength(unit: Unit): number {
  return unit.hp >= Math.ceil(getUnitDef(unit.type).maxHp / 2) ? 2 : 1;
}

function doCapture(state: GameState, unitId: number, events: GameEvent[]): void {
  const unit = requireOwnUnit(state, unitId);
  if (!getUnitDef(unit.type).canCapture) fail(`${getUnitDef(unit.type).name} cannot capture`);
  const b = buildingAt(state, unit.x, unit.y);
  if (!b) fail('there is nothing to capture here');
  if (b.owner === unit.owner) fail('you already own this building');
  const def = getBuildingDef(b.type);
  if (!b.capture || b.capture.unitId !== unit.id) b.capture = { unitId: unit.id, points: 0 };
  b.capture.points += captureStrength(unit);
  unit.moved = true;
  unit.acted = true;
  if (b.capture.points < def.capturePoints) {
    events.push({ type: 'captureProgress', buildingId: b.id, unitId, points: b.capture.points, required: def.capturePoints });
    return;
  }
  const previous = b.owner;
  b.owner = unit.owner;
  b.capture = null;
  state.players[unit.owner].stats.captured += 1;
  events.push({ type: 'captured', buildingId: b.id, unitId, owner: unit.owner, previous });
  if (def.hq && previous !== null && !state.players[previous].eliminated) eliminate(state, previous, events);
}

function doBuild(state: GameState, buildingId: number, unitType: string, events: GameEvent[]): void {
  const b = getBuilding(state, buildingId);
  if (!b) fail(`no building ${buildingId}`);
  if (b.owner !== state.currentPlayer) fail('not your building');
  const def = getBuildingDef(b.type);
  if (!def.produces.includes(unitType)) fail(`${def.name} cannot build ${unitType}`);
  if (unitAt(state, b.x, b.y)) fail('the building is occupied');
  const udef = getUnitDef(unitType);
  const player = state.players[state.currentPlayer];
  if (player.gold < udef.cost) fail('not enough gold');
  player.gold -= udef.cost;
  const unit: Unit = {
    id: state.nextUnitId++,
    type: unitType,
    owner: state.currentPlayer,
    x: b.x,
    y: b.y,
    hp: udef.maxHp,
    moved: true,
    acted: true,
  };
  state.units.push(unit);
  player.stats.built += 1;
  events.push({ type: 'built', buildingId, unitId: unit.id, unitType });
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
  if (state.options.dayLimit > 0 && state.round > state.options.dayLimit) {
    finishOnScore(state, events);
    return;
  }
  startTurn(state, events);
}

/** Ends the game when the day limit runs out: the best score wins, a tie is a draw. */
function finishOnScore(state: GameState, events: GameEvent[]): void {
  state.round = state.options.dayLimit;
  let best = -1;
  let winner: number | null = null;
  state.players.forEach((p, i) => {
    if (p.eliminated) return;
    const score = scoreOf(state, i);
    if (score > best) {
      best = score;
      winner = i;
    } else if (score === best) {
      winner = null;
    }
  });
  state.gameOver = true;
  state.winner = winner;
  events.push({ type: 'gameOver', winner });
}

/** Removes a player from the game: their units disband and their buildings fall neutral. */
function eliminate(state: GameState, player: number, events: GameEvent[]): void {
  state.players[player].eliminated = true;
  state.units = state.units.filter((u) => u.owner !== player);
  for (const b of state.buildings) {
    if (b.owner === player) b.owner = null;
    if (b.capture && !state.units.some((u) => u.id === b.capture!.unitId)) b.capture = null;
  }
  events.push({ type: 'eliminated', player });
}

/** Whether a player owns a building that can still raise units. */
function canProduce(state: GameState, player: number): boolean {
  return state.buildings.some((b) => b.owner === player && getBuildingDef(b.type).produces.length > 0);
}

/**
 * Eliminates routed players (no units and nowhere to raise more) and ends the game when
 * one player remains. Losing a keep is handled when it is captured. If the current player
 * was eliminated mid-turn, play passes on.
 */
export function checkVictory(state: GameState, events: GameEvent[]): void {
  if (state.gameOver) return;
  state.players.forEach((p, i) => {
    if (p.eliminated) return;
    if (!state.units.some((u) => u.owner === i) && !canProduce(state, i)) eliminate(state, i, events);
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

/** Start-of-turn bookkeeping for state.currentPlayer: refresh, income and healing. */
export function startTurn(state: GameState, events: GameEvent[]): void {
  const player = state.currentPlayer;
  for (const u of state.units) {
    if (u.owner === player) {
      u.moved = false;
      u.acted = false;
    }
  }
  const income = incomeOf(state, player);
  state.players[player].gold += income;
  events.push({ type: 'turnStarted', player, round: state.round, income });
  for (const u of state.units) {
    if (u.owner !== player) continue;
    const b = buildingAt(state, u.x, u.y);
    if (!b || b.owner !== player) continue;
    const max = getUnitDef(u.type).maxHp;
    const amount = Math.min(getBuildingDef(b.type).heal, max - u.hp);
    if (amount > 0) {
      u.hp += amount;
      events.push({ type: 'healed', unitId: u.id, amount });
    }
  }
}
