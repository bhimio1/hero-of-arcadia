import { describe, expect, it } from 'vitest';
import { GreedyAi } from './ai/greedy';
import { canSee, playerView, visibilityMask } from './fog';
import { toIndex } from './grid';
import { listLegalActions } from './legal';
import { canUndo, dispatch, type Match } from './match';
import { applyAction, applyOrThrow } from './rules';
import { createGame, getUnit } from './state';
import { makeGame, makeMap } from './testing';
import type { MapUnitPlacement } from './types';

const open = ['..........', '..........', '..........'];

function fogGame(units: MapUnitPlacement[], rows = open) {
  return makeGame(rows, units, { fog: true });
}

describe('visibility', () => {
  it('sees within vision range and nothing beyond', () => {
    // pikeman vision 2
    const s = fogGame([{ type: 'pikeman', owner: 0, x: 0, y: 1 }, { type: 'pikeman', owner: 1, x: 9, y: 1 }]);
    const mask = visibilityMask(s, 0);
    expect(mask[toIndex(10, 2, 1)]).toBe(true);
    expect(mask[toIndex(10, 1, 0)]).toBe(true);
    expect(mask[toIndex(10, 3, 1)]).toBe(false);
    expect(canSee(s, 0, s.units[1])).toBe(false);
  });

  it('forests hide units unless an enemy stands next to them', () => {
    const s = fogGame(
      [
        { type: 'archer', owner: 0, x: 0, y: 0 },
        { type: 'pikeman', owner: 1, x: 2, y: 0 },
        { type: 'pikeman', owner: 1, x: 1, y: 1 },
      ],
      ['..f.......', '.f........', '..........'],
    );
    expect(canSee(s, 0, s.units[1])).toBe(false); // in forest, 2 tiles away
    expect(canSee(s, 0, s.units[2])).toBe(false); // in forest, diagonal (distance 2)
    const near = fogGame(
      [{ type: 'archer', owner: 0, x: 1, y: 0 }, { type: 'pikeman', owner: 1, x: 2, y: 0 }],
      ['..f.......', '..........', '..........'],
    );
    expect(canSee(near, 0, near.units[1])).toBe(true);
  });

  it('high ground extends vision', () => {
    const s = fogGame(
      [{ type: 'pikeman', owner: 0, x: 0, y: 1 }, { type: 'pikeman', owner: 1, x: 9, y: 1 }],
      ['..........', '^.........', '..........'],
    );
    expect(visibilityMask(s, 0)[toIndex(10, 4, 1)]).toBe(true); // vision 2 + mountain 2
  });

  it('owned buildings see their own tile', () => {
    const s = makeGame(open, [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 9, y: 2 }], { fog: true }, {
      buildings: [{ type: 'village', x: 9, y: 2, owner: 0 }],
    });
    expect(canSee(s, 0, s.units[1])).toBe(true);
  });

  it('everything is visible without fog', () => {
    const s = makeGame(open, [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 9, y: 2 }]);
    expect(visibilityMask(s, 0).every(Boolean)).toBe(true);
    expect(playerView(s, 0)).toBe(s);
  });
});

describe('player view', () => {
  it('removes hidden enemies and their capture progress', () => {
    let s = makeGame(open, [
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 9, y: 2 },
    ], { fog: true }, { buildings: [{ type: 'village', x: 9, y: 2, owner: null }] });
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    s = applyOrThrow(s, { type: 'capture', unitId: 2 }).state;
    const view = playerView(s, 0);
    expect(view.units.map((u) => u.id)).toEqual([1]);
    expect(view.buildings[0].capture).toBeNull();
    expect(s.buildings[0].capture).not.toBeNull(); // the real state is untouched
  });
});

describe('fog rules', () => {
  it('hidden enemies cannot be attacked', () => {
    const s = fogGame(
      [{ type: 'archer', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 2, y: 0 }],
      ['..f.......', '..........', '..........'],
    );
    expect(applyAction(s, { type: 'attack', unitId: 1, targetId: 2 }).ok).toBe(false);
    expect(listLegalActions(s).some((a) => a.type === 'attack')).toBe(false);
  });

  it('walking into a hidden enemy springs an ambush', () => {
    // the enemy hides in the forest at x=3; the rider plans a path straight through it
    const s = fogGame(
      [{ type: 'rider', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 3, y: 0 }],
      ['...f......', '..........', '..........'],
    );
    const path = [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 }));
    const { state, events } = applyOrThrow(s, { type: 'move', unitId: 1, path });
    const rider = getUnit(state, 1)!;
    expect([rider.x, rider.y]).toEqual([2, 0]);
    expect(rider.acted).toBe(true);
    expect(events).toContainEqual({ type: 'ambushed', unitId: 1, by: 2, x: 3, y: 0 });
  });

  it('visible enemies still block paths', () => {
    const s = fogGame([{ type: 'rider', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 2, y: 0 }]);
    const path = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
    expect(applyAction(s, { type: 'move', unitId: 1, path }).ok).toBe(false);
  });

  it('a move that reveals the enemy cannot be undone', () => {
    const map = makeMap(['..........'], [
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 6, y: 0 },
    ], { fog: true });
    const m: Match = { setup: { mapId: 'test', seed: 1 }, actions: [], state: createGame({ mapId: 'test', seed: 1 }, map), history: [], undoFloor: 0 };
    dispatch(m, { type: 'move', unitId: 1, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(canUndo(m)).toBe(true); // still sees nothing new
    m.state = m.history.pop()!;
    m.actions.pop();
    dispatch(m, { type: 'move', unitId: 1, path: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })) });
    expect(canUndo(m)).toBe(false); // now the enemy at x=6 is in sight
  });

  it('the AI never targets or reacts to units it cannot see', () => {
    // an enemy catapult sits hidden in a forest two tiles from the AI's rider
    const s = fogGame(
      [{ type: 'rider', owner: 0, x: 0, y: 0 }, { type: 'catapult', owner: 1, x: 2, y: 0, hp: 1 }],
      ['..f.......', '..........', '..........'],
    );
    const action = new GreedyAi().nextAction(playerView(s, 0));
    expect(action.type === 'attack').toBe(false);
    expect(JSON.stringify(action)).not.toContain('"targetId":2');
  });
});
