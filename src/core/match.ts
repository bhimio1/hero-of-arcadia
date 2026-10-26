// A Match is a game in progress: its setup, the action log and the current state.
// The log plus the setup's seed is all that is needed to rebuild any state (see replay).

import { applyAction } from './rules';
import { createGame, type GameSetup } from './state';
import type { Action, GameEvent, GameState } from './types';

export interface Match {
  setup: GameSetup;
  /** Every applied action, in order. */
  actions: Action[];
  state: GameState;
  /** States before each action (in-memory only; used for undo). */
  history: GameState[];
  /** Index into history/actions from which undo is allowed (actions loaded from a save cannot be undone). */
  undoFloor: number;
}

export function newMatch(setup: GameSetup): Match {
  return { setup, actions: [], state: createGame(setup), history: [], undoFloor: 0 };
}

export type DispatchResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export function dispatch(match: Match, action: Action): DispatchResult {
  const res = applyAction(match.state, action);
  if (!res.ok) return res;
  match.history.push(match.state);
  match.actions.push(action);
  match.state = res.state;
  return { ok: true, events: res.events };
}

/** Whether the last action is a move that may still be taken back. */
export function canUndo(match: Match): boolean {
  const n = match.actions.length;
  if (n === 0 || n <= match.undoFloor) return false;
  const last = match.actions[n - 1];
  if (last.type !== 'move') return false;
  const unit = match.state.units.find((u) => u.id === last.unitId);
  return !!unit && !unit.acted;
}

/** Reverts the last move. Returns false if undo is not allowed. */
export function undo(match: Match): boolean {
  if (!canUndo(match)) return false;
  match.actions.pop();
  match.state = match.history.pop()!;
  return true;
}
