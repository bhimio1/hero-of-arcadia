import { describe, expect, it } from 'vitest';
import { createGame } from '../state';
import { makeGame } from '../testing';
import { MAPS } from '../data';
import { GreedyAi } from './greedy';
import { playTurn } from './testkit';

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

describe('AI economy', () => {
  it('captures buildings and raises troops', () => {
    let state = createGame({
      mapId: 'first-ford',
      seed: 1,
      players: MAPS['first-ford'].players.map((p) => ({ faction: p.faction, controller: 'ai' as const })),
    });
    const ai = new GreedyAi();
    while (state.round <= 8) state = playTurn(state, ai).state;
    for (const p of [0, 1]) {
      expect(state.players[p].stats.captured, `player ${p} captured`).toBeGreaterThan(0);
      expect(state.players[p].stats.built, `player ${p} built`).toBeGreaterThan(0);
    }
  });
});
