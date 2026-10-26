import { describe, expect, it } from 'vitest';
import { TERRAIN, UNITS } from '../../core/data';
import { gridToIndices, rotateGrid, SPRITES, validateSprite } from './spriteData';

describe('sprite data', () => {
  it('every sprite file is well formed', () => {
    for (const file of Object.values(SPRITES)) expect(validateSprite(file)).toEqual([]);
  });

  it('every unit has idle (2 frames) and attack sprites', () => {
    for (const id of Object.keys(UNITS)) {
      const s = SPRITES[`units/${id}`];
      expect(s, id).toBeDefined();
      expect(s.frames.idle).toHaveLength(2);
      expect(s.frames.attack.length).toBeGreaterThan(0);
      expect(s.frames.idle[0]).toHaveLength(16);
      expect(s.frames.idle[0][0]).toHaveLength(16);
    }
  });

  it('every terrain has a sprite', () => {
    for (const t of Object.values(TERRAIN)) expect(SPRITES[`terrain/${t.sprite}`], t.id).toBeDefined();
  });

  it('swaps team colours', () => {
    const grid = ['123'];
    expect(gridToIndices(grid, {}, 'cobalt')).toEqual([18, 17, 15]);
    expect(gridToIndices(grid, {}, 'ember')).toEqual([28, 27, 2]);
    expect(gridToIndices(['.k'], {})).toEqual([-1, 1]);
  });

  it('rotates grids clockwise', () => {
    expect(rotateGrid(['ab', 'cd'])).toEqual(['ca', 'db']);
    expect(rotateGrid(['ab', 'cd'], 4)).toEqual(['ab', 'cd']);
  });
});
