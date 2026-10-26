import { describe, expect, it } from 'vitest';
import { applyAction, applyOrThrow } from './rules';
import { getUnit } from './state';
import { makeGame } from './testing';

const rows = ['.....', '.....', '..~..'];
const units = [
  { type: 'pikeman', owner: 0, x: 0, y: 0 },
  { type: 'rider', owner: 0, x: 0, y: 1 },
  { type: 'pikeman', owner: 1, x: 4, y: 0 },
];

describe('move action', () => {
  it('moves a unit along a valid path and marks it moved', () => {
    const s = makeGame(rows, units);
    const { state, events } = applyOrThrow(s, { type: 'move', unitId: 1, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] });
    const u = getUnit(state, 1)!;
    expect([u.x, u.y, u.moved, u.acted]).toEqual([2, 0, true, false]);
    expect(events[0]).toMatchObject({ type: 'moved', unitId: 1 });
    // the input state is untouched
    expect(getUnit(s, 1)!.x).toBe(0);
  });

  it('rejects paths that are too long, broken, blocked or end on a unit', () => {
    const s = makeGame(rows, units);
    const bad = [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }], // 4 > move 3
      [{ x: 0, y: 0 }, { x: 2, y: 0 }], // not adjacent
      [{ x: 1, y: 0 }, { x: 2, y: 0 }], // does not start at the unit
      [{ x: 0, y: 0 }, { x: 0, y: 1 }], // ends on an ally
      [{ x: 0, y: 0 }], // empty move
    ];
    for (const path of bad) {
      expect(applyAction(s, { type: 'move', unitId: 1, path }).ok).toBe(false);
    }
    // the rider cannot walk through the enemy pikeman
    const blocked = [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 0 }, { x: 4, y: 0 }];
    expect(applyAction(s, { type: 'move', unitId: 2, path: blocked }).ok).toBe(false);
    // water is impassable
    expect(applyAction(s, { type: 'move', unitId: 2, path: [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }] }).ok).toBe(false);
  });

  it('allows only one move per turn and only for the current player', () => {
    const s = makeGame(rows, units);
    const moved = applyOrThrow(s, { type: 'move', unitId: 1, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }).state;
    expect(applyAction(moved, { type: 'move', unitId: 1, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }).ok).toBe(false);
    expect(applyAction(s, { type: 'move', unitId: 3, path: [{ x: 4, y: 0 }, { x: 3, y: 0 }] }).ok).toBe(false);
  });

  it('wait ends the unit turn', () => {
    const s = makeGame(rows, units);
    const after = applyOrThrow(s, { type: 'wait', unitId: 1 }).state;
    expect(getUnit(after, 1)!.acted).toBe(true);
    expect(applyAction(after, { type: 'wait', unitId: 1 }).ok).toBe(false);
  });
});

describe('end turn', () => {
  it('passes play to the next player, refreshes units and counts rounds', () => {
    let s = makeGame(rows, units);
    s = applyOrThrow(s, { type: 'wait', unitId: 1 }).state;
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    expect(s.currentPlayer).toBe(1);
    expect(s.round).toBe(1);
    expect(getUnit(s, 1)!.acted).toBe(false);
    const r = applyOrThrow(s, { type: 'endTurn' });
    expect(r.state.currentPlayer).toBe(0);
    expect(r.state.round).toBe(2);
    expect(r.events).toContainEqual({ type: 'turnStarted', player: 0, round: 2, income: 0 });
  });
});
