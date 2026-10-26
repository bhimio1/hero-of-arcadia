import { describe, expect, it } from 'vitest';
import { MAPS, UNITS, validateMap, parseMapTerrain } from './data';
import { makeMap } from './testing';

describe('data files', () => {
  it('all bundled maps are valid', () => {
    expect(Object.keys(MAPS).length).toBeGreaterThan(0);
    for (const m of Object.values(MAPS)) expect(() => validateMap(m)).not.toThrow();
  });

  it('units have sane stats', () => {
    for (const u of Object.values(UNITS)) {
      expect(u.cost).toBeGreaterThan(0);
      expect(u.range[1]).toBeGreaterThanOrEqual(u.range[0]);
    }
  });

  it('rejects broken maps', () => {
    expect(() => validateMap(makeMap(['..', '.'], [{ type: 'pikeman', owner: 0, x: 0, y: 0 }]))).toThrow(/row 1/);
    expect(() => validateMap(makeMap(['.?'], [{ type: 'pikeman', owner: 0, x: 0, y: 0 }]))).toThrow(/unknown terrain/);
    expect(() =>
      validateMap(makeMap(['.~'], [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 1, y: 0 }])),
    ).toThrow(/impassable/);
    expect(() => validateMap(makeMap(['..'], [{ type: 'pikeman', owner: 0, x: 0, y: 0 }]))).toThrow(/no starting units/);
  });

  it('parses terrain rows', () => {
    const { width, height, terrain } = parseMapTerrain(makeMap(['.f', '^~'], []));
    expect([width, height]).toEqual([2, 2]);
    expect(terrain).toEqual(['plains', 'forest', 'mountain', 'water']);
  });
});
