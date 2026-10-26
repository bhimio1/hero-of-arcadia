import { describe, expect, it } from 'vitest';
import { fromIndex, inBounds, manhattan, neighbors, tilesInRange, toIndex } from './grid';

describe('grid', () => {
  it('converts between coords and indices', () => {
    expect(toIndex(10, 3, 2)).toBe(23);
    expect(fromIndex(10, 23)).toEqual({ x: 3, y: 2 });
  });

  it('checks bounds', () => {
    expect(inBounds(4, 3, 0, 0)).toBe(true);
    expect(inBounds(4, 3, 3, 2)).toBe(true);
    expect(inBounds(4, 3, 4, 2)).toBe(false);
    expect(inBounds(4, 3, -1, 0)).toBe(false);
  });

  it('measures manhattan distance', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it('lists neighbours in N, E, S, W order and clips at edges', () => {
    expect(neighbors(5, 5, { x: 2, y: 2 })).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 1, y: 2 },
    ]);
    expect(neighbors(5, 5, { x: 0, y: 0 })).toHaveLength(2);
  });

  it('finds tiles within a distance band', () => {
    const ring = tilesInRange(9, 9, { x: 4, y: 4 }, 2, 2);
    expect(ring).toHaveLength(8);
    expect(ring.every((c) => manhattan(c, { x: 4, y: 4 }) === 2)).toBe(true);
    expect(tilesInRange(9, 9, { x: 4, y: 4 }, 1, 3)).toHaveLength(4 + 8 + 12);
    expect(tilesInRange(3, 3, { x: 0, y: 0 }, 1, 1)).toHaveLength(2);
  });
});
