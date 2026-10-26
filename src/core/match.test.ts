import { describe, expect, it } from 'vitest';
import { canUndo, dispatch, newMatch, undo } from './match';
import { getUnit } from './state';

describe('match', () => {
  it('logs actions and undoes a move until the unit acts', () => {
    const m = newMatch({ mapId: 'greenvale', seed: 5 });
    const unit = m.state.units.find((u) => u.owner === 0 && u.type === 'pikeman')!;
    const path = [{ x: unit.x, y: unit.y }, { x: unit.x + 1, y: unit.y }];
    expect(dispatch(m, { type: 'move', unitId: unit.id, path }).ok).toBe(true);
    expect(m.actions).toHaveLength(1);
    expect(canUndo(m)).toBe(true);
    expect(undo(m)).toBe(true);
    expect(getUnit(m.state, unit.id)!.x).toBe(unit.x);
    expect(m.actions).toHaveLength(0);

    dispatch(m, { type: 'move', unitId: unit.id, path });
    dispatch(m, { type: 'wait', unitId: unit.id });
    expect(canUndo(m)).toBe(false);
    expect(undo(m)).toBe(false);
  });

  it('does not log rejected actions', () => {
    const m = newMatch({ mapId: 'greenvale', seed: 5 });
    expect(dispatch(m, { type: 'wait', unitId: 999 }).ok).toBe(false);
    expect(m.actions).toHaveLength(0);
  });
});
