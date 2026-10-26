import { describe, expect, it } from 'vitest';
import { applyAction } from '../rules';
import { createGame } from '../state';
import { makeGame } from '../testing';
import { MAPS } from '../data';
import type { Action, GameState } from '../types';
import { GreedyAi } from './greedy';

/** Plays the AI's whole turn, checking every action is legal. */
function playTurn(state: GameState, ai = new GreedyAi()): { state: GameState; actions: Action[] } {
  const actions: Action[] = [];
  const player = state.currentPlayer;
  for (let i = 0; i < 500; i++) {
    const action = ai.nextAction(state);
    const res = applyAction(state, action);
    if (!res.ok) throw new Error(`AI chose illegal ${JSON.stringify(action)}: ${res.error}`);
    actions.push(action);
    state = res.state;
    if (action.type === 'endTurn' || state.gameOver || state.currentPlayer !== player) return { state, actions };
  }
  throw new Error('AI did not end its turn');
}

describe('greedy AI', () => {
  it('finishes off a weak enemy instead of idling', () => {
    const s = makeGame(['.....', '.....'], [
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 3, y: 0, hp: 3 },
      { type: 'pikeman', owner: 1, x: 4, y: 1 },
    ]);
    const { actions } = playTurn(s);
    expect(actions).toContainEqual({ type: 'attack', unitId: 1, targetId: 2 });
  });

  it('prefers the most valuable kill', () => {
    const s = makeGame(['.......'], [
      { type: 'rider', owner: 0, x: 3, y: 0 },
      { type: 'pikeman', owner: 1, x: 2, y: 0, hp: 2 },
      { type: 'catapult', owner: 1, x: 4, y: 0, hp: 2 },
    ]);
    const first = new GreedyAi().nextAction(s);
    expect(first).toEqual({ type: 'attack', unitId: 1, targetId: 3 });
  });

  it('advances toward enemies it cannot reach yet', () => {
    const s = makeGame(['..............'], [
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 13, y: 0 },
    ]);
    const { state } = playTurn(s);
    expect(state.units.find((u) => u.id === 1)!.x).toBe(3);
  });

  it('never moves a catapult and fires in the same turn', () => {
    const s = makeGame(['........'], [
      { type: 'catapult', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 4, y: 0 },
    ]);
    const { actions } = playTurn(s);
    const moved = actions.some((a) => a.type === 'move' && a.unitId === 1);
    const fired = actions.some((a) => a.type === 'attack' && a.unitId === 1);
    expect(moved && fired).toBe(false);
  });

  it('keeps archers out of melee reach when it can shoot from safety', () => {
    // the enemy rider at x=9 threatens up to x=2 (move 6 + range 1); the archer at 0 is safe
    const s = makeGame(['..........'], [
      { type: 'archer', owner: 0, x: 0, y: 0 },
      { type: 'rider', owner: 1, x: 9, y: 0 },
    ]);
    const { state } = playTurn(s);
    expect(state.units.find((u) => u.id === 1)!.x).toBeLessThanOrEqual(1);
  });
});

describe('AI vs AI', () => {
  const maps = Object.keys(MAPS);
  for (const mapId of maps) {
    for (const seed of [1, 2, 3]) {
      it(`${mapId} (seed ${seed}) plays to a finish with only legal actions`, () => {
        let state = createGame({
          mapId,
          seed,
          luck: true,
          players: MAPS[mapId].players.map((p) => ({ faction: p.faction, controller: 'ai' })),
        });
        const ai = new GreedyAi();
        let turns = 0;
        while (!state.gameOver && turns < 400) {
          state = playTurn(state, ai).state;
          turns++;
        }
        expect(state.gameOver, `stalled at round ${state.round}`).toBe(true);
      });
    }
  }
});
