import { describe, expect, it } from 'vitest';
import { applyOrThrow } from './rules';
import { createGame } from './state';
import { makeGame, makeMap } from './testing';

describe('victory', () => {
  it('ends the game when a player loses their last unit', () => {
    const s = makeGame(['....'], [
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0, hp: 2 },
    ]);
    const { state, events } = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 });
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.players[1].eliminated).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'gameOver', winner: 0 });
  });

  it('the attacker can lose to a counterattack', () => {
    const s = makeGame(['....'], [
      { type: 'pikeman', owner: 0, x: 0, y: 0, hp: 1 },
      { type: 'rider', owner: 1, x: 1, y: 0 },
    ]);
    const { state } = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 });
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe(1);
  });

  it('with three players, play continues and skips the eliminated one', () => {
    const map = makeMap(['......'], [
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0, hp: 1 },
      { type: 'pikeman', owner: 2, x: 5, y: 0 },
    ], {
      players: [
        { faction: 'alpha', controller: 'human' },
        { faction: 'beta', controller: 'human' },
        { faction: 'alpha', controller: 'human' },
      ],
    });
    let s = createGame({ mapId: 'test', seed: 1 }, map);
    s = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 }).state;
    expect(s.gameOver).toBe(false);
    expect(s.players[1].eliminated).toBe(true);
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    expect(s.currentPlayer).toBe(2);
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    expect(s.currentPlayer).toBe(0);
    expect(s.round).toBe(2);
  });

  it('no actions are accepted after the game ends', () => {
    const s = makeGame(['....'], [
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0, hp: 2 },
    ]);
    const over = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 }).state;
    expect(() => applyOrThrow(over, { type: 'endTurn' })).toThrow(/game is over/);
  });
});
