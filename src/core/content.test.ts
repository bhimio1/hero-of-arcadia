import { afterEach, describe, expect, it } from 'vitest';
import { ContentError, deepMerge, resolveContent, type ContentLayer } from './content';
import { BASE_LAYER, BUILDINGS, getUnitDef, loadContent, MAPS, RULES, UNITS } from './data';

const layer = (pack: ContentLayer['pack'], remove?: ContentLayer['remove']): ContentLayer => ({ source: 'test', pack, remove });

function issues(layers: ContentLayer[]): string[] {
  try {
    resolveContent(layers);
    return [];
  } catch (e) {
    if (e instanceof ContentError) return e.issues.map((i) => `${i.path}: ${i.message}`);
    throw e;
  }
}

afterEach(() => {
  loadContent([BASE_LAYER]);
});

describe('deepMerge', () => {
  it('merges objects recursively and replaces arrays and primitives', () => {
    const base = { a: 1, nested: { x: 1, y: 2 }, list: [1, 2] };
    expect(deepMerge(base, { nested: { y: 3 }, list: [9] })).toEqual({ a: 1, nested: { x: 1, y: 3 }, list: [9] });
    expect(base.nested.y).toBe(2); // the input is untouched
  });
});

describe('layering', () => {
  it('patches an existing entry with only the changed fields', () => {
    loadContent([BASE_LAYER, layer({ units: [{ id: 'archer', attack: 9 }] })]);
    expect(getUnitDef('archer').attack).toBe(9);
    expect(getUnitDef('archer').range).toEqual([2, 2]); // untouched fields survive
  });

  it('adds new entries and overrides rules', () => {
    const golem = { ...getUnitDef('pikeman'), id: 'golem', name: 'Golem', attack: 8, tags: ['construct'] };
    loadContent([BASE_LAYER, layer({ units: [golem], rules: { luckMax: 3 } })]);
    expect(UNITS.golem.name).toBe('Golem');
    expect(RULES.luckMax).toBe(3);
    expect(RULES.defensePerPoint).toBe(0.1);
  });

  it('removing a unit prunes harmless references to it', () => {
    loadContent([BASE_LAYER, layer({}, { units: ['catapult'] })]);
    expect('catapult' in UNITS).toBe(false);
    expect(BUILDINGS.barracks.produces).not.toContain('catapult');
  });

  it('drops a broken map with a warning instead of failing', () => {
    const w = loadContent([BASE_LAYER, layer({ maps: [{ id: 'broken', name: 'Broken', description: '', rows: ['.?'], players: [], units: [] }] })]);
    expect('broken' in MAPS).toBe(false);
    expect(w[0].path).toBe('maps.broken');
    expect('first-ford' in MAPS).toBe(true);
  });

  it('removing a unit a map depends on drops that map', () => {
    const w = loadContent([BASE_LAYER, layer({}, { units: ['catapult'] })]);
    expect('greenvale' in MAPS).toBe(false);
    expect(w.some((i) => i.path === 'maps.greenvale')).toBe(true);
  });
});

describe('validation', () => {
  it('reports every problem with a precise path', () => {
    const found = issues([
      BASE_LAYER,
      layer({
        units: [
          { id: 'archer', range: [3, 1] as [number, number], moveType: 'flying' },
          { id: 'ghost', name: 'Ghost' },
        ],
        terrain: [{ id: 'forest', char: '.' }],
        factions: [{ id: 'cobalt', perks: [{ name: 'X', effects: [{ type: 'unitStat', stat: 'luck' as never }] }] }],
      }),
    ]);
    expect(found).toContain('units.archer.range: must be [min, max] with 1 <= min <= max');
    expect(found).toContain('units.archer.moveType: unknown move type "flying"');
    expect(found.some((f) => f.startsWith('units.ghost.cost'))).toBe(true);
    expect(found.some((f) => f.startsWith('terrain.') && f.includes('already used'))).toBe(true);
    expect(found.some((f) => f.startsWith('factions.cobalt.perks[0].effects[0].stat'))).toBe(true);
  });

  it('rejects entries without ids and non-list categories', () => {
    expect(issues([BASE_LAYER, layer({ units: [{ name: 'Nameless' } as never] })])).toEqual(['test.units[0]: entry needs a string "id"']);
    expect(issues([BASE_LAYER, layer({ units: {} as never })])).toEqual(['test.units: must be a list']);
  });

  it('the base game content is valid', () => {
    expect(() => resolveContent([BASE_LAYER])).not.toThrow();
  });
});
