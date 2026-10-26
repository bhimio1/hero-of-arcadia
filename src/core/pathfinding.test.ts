import { describe, expect, it } from 'vitest';
import { computeReach, destinations, distanceField, pathCost, pathTo } from './pathfinding';
import { getUnit } from './state';
import { makeGame } from './testing';
import { toIndex } from './grid';

const open = ['.......', '.......', '.......', '.......', '.......'];

describe('movement range', () => {
  it('foot units reach a diamond of radius move on open ground', () => {
    const s = makeGame(open, [{ type: 'pikeman', owner: 0, x: 3, y: 2 }, { type: 'pikeman', owner: 1, x: 0, y: 0 }]);
    const reach = computeReach(s, getUnit(s, 1)!);
    // move 3 on a 7x5 board clipped at the edges
    for (const [idx, cost] of reach.cost) {
      const x = idx % 7;
      const y = Math.floor(idx / 7);
      expect(cost).toBe(Math.abs(x - 3) + Math.abs(y - 2));
      expect(cost).toBeLessThanOrEqual(3);
    }
    expect(reach.cost.size).toBe(25 - 2); // full diamond minus the two tips past the top and bottom edges
  });

  it('applies per move-type terrain costs', () => {
    // forest costs mounted 2, foot 1
    const rows = ['ffffff', 'ffffff'];
    const s = makeGame(rows, [
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 0, x: 0, y: 1 },
      { type: 'pikeman', owner: 1, x: 5, y: 1 },
    ]);
    const rider = computeReach(s, getUnit(s, 1)!);
    expect(rider.cost.get(toIndex(6, 3, 0))).toBe(6);
    expect(rider.cost.has(toIndex(6, 4, 0))).toBe(false); // (4,0) would cost 8
    const pike = computeReach(s, getUnit(s, 2)!);
    expect(pike.cost.get(toIndex(6, 3, 1))).toBe(3);
  });

  it('treats impassable terrain as walls', () => {
    // mountains are foot-only, water is impassable for everyone
    const rows = ['.^...', '.~...', '.....'];
    const s = makeGame(rows, [
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 0, x: 2, y: 0 },
      { type: 'pikeman', owner: 1, x: 4, y: 2 },
    ]);
    const rider = computeReach(s, getUnit(s, 1)!);
    expect(rider.cost.has(toIndex(5, 1, 0))).toBe(false); // mountain
    expect(rider.cost.has(toIndex(5, 1, 1))).toBe(false); // water
    // the rider must go around the river: (0,1),(0,2),(1,2),(2,2),(2,1),(2,0)
    expect(rider.cost.get(toIndex(5, 2, 0))).toBe(6);
    const pike = computeReach(s, getUnit(s, 2)!);
    expect(pike.cost.get(toIndex(5, 1, 0))).toBe(3); // foot units can climb mountains (cost 3)
  });

  it('passes through allies but not enemies, and never ends on an occupied tile', () => {
    const rows = ['.....'];
    const s = makeGame(rows, [
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 0, x: 1, y: 0 },
      { type: 'pikeman', owner: 1, x: 3, y: 0 },
    ]);
    const unit = getUnit(s, 1)!;
    const reach = computeReach(s, unit);
    expect(reach.cost.get(2)).toBe(2); // through the ally
    expect(reach.cost.has(3)).toBe(false); // enemy blocks
    expect(reach.cost.has(4)).toBe(false); // ...and everything behind it
    const dests = destinations(s, unit, reach).map((c) => c.x);
    expect(dests.sort()).toEqual([0, 2]);
  });

  it('reconstructs the cheapest path', () => {
    const rows = ['.f.', '...', '...'];
    const s = makeGame(rows, [{ type: 'rider', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 2, y: 2 }]);
    const reach = computeReach(s, getUnit(s, 1)!);
    const path = pathTo(reach, { x: 2, y: 0 })!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
    expect(pathCost(s, 'mounted', path)).toBe(reach.cost.get(2));
    expect(pathTo(reach, { x: 2, y: 2 })).toBeNull();
  });

  it('is deterministic', () => {
    const s = makeGame(open, [{ type: 'rider', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 6, y: 4 }]);
    const a = pathTo(computeReach(s, getUnit(s, 1)!), { x: 3, y: 3 });
    const b = pathTo(computeReach(s, getUnit(s, 1)!), { x: 3, y: 3 });
    expect(a).toEqual(b);
  });

  it('rejects malformed paths', () => {
    const s = makeGame(['..~.'], [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 3, y: 0 }]);
    expect(pathCost(s, 'foot', [{ x: 0, y: 0 }, { x: 2, y: 0 }])).toBeNull(); // not adjacent
    expect(pathCost(s, 'foot', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBeNull(); // water
    expect(pathCost(s, 'foot', [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(1);
  });

  it('builds distance fields toward goals', () => {
    const s = makeGame(['...f.'], [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 4, y: 0 }]);
    const d = distanceField(s, 'mounted', [{ x: 4, y: 0 }]);
    // walking from x=0 to x=4 as a rider enters (1),(2),(3 forest=2),(4) = 1+1+2+1
    expect(d[0]).toBe(5);
    expect(d[4]).toBe(0);
  });
});
