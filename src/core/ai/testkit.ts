// Shared helper for AI tests: plays one full AI turn, checking every action is legal.
import { playerView } from '../fog';
import { applyAction } from '../rules';
import { createGame } from '../state';
import { MAPS } from '../data';
import type { Action, GameState } from '../types';
import { GreedyAi } from './greedy';

export function playTurn(state: GameState, ai = new GreedyAi()): { state: GameState; actions: Action[] } {
  const actions: Action[] = [];
  const player = state.currentPlayer;
  for (let i = 0; i < 500; i++) {
    const action = ai.nextAction(playerView(state, player));
    const res = applyAction(state, action);
    if (!res.ok) throw new Error(`AI chose illegal ${JSON.stringify(action)}: ${res.error}`);
    actions.push(action);
    state = res.state;
    if (action.type === 'endTurn' || state.gameOver || state.currentPlayer !== player) return { state, actions };
  }
  throw new Error('AI did not end its turn');
}

/** Plays a whole AI-vs-AI game (with a day limit so it always ends) and returns the final state. */
export function playAiGame(mapId: string, seed: number, dayLimit = 30): GameState {
  let state = createGame({
    mapId,
    seed,
    luck: true,
    dayLimit,
    players: MAPS[mapId].players.map((p) => ({ faction: p.faction, controller: 'ai' as const })),
  });
  const ai = new GreedyAi();
  for (let turns = 0; !state.gameOver && turns < 400; turns++) state = playTurn(state, ai).state;
  return state;
}
