import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDamage } from './combat';
import { BASE_LAYER, loadContent } from './data';
import { applyOrThrow } from './rules';
import { getUnit } from './state';
import {
  captureStrength,
  damageMultiplier,
  defenseBonus,
  healAmount,
  incomeOf,
  moveCostFor,
  rosterFor,
  statsOf,
  unitStatsFor,
} from './stats';
import { makeGame } from './testing';
import type { FactionDef, MapUnitPlacement } from './types';

// A test faction that exercises every effect type.
const tester: FactionDef = {
  id: 'tester',
  name: 'Test Legion',
  short: 'Test',
  ramp: [21, 20, 22],
  perks: [
    {
      name: 'Everything',
      effects: [
        { type: 'unitStat', stat: 'attack', add: 2, tags: ['cavalry'] },
        { type: 'unitStat', stat: 'move', mul: 2, units: ['pikeman'] },
        { type: 'unitStat', stat: 'rangeMax', add: 1, units: ['archer'] },
        { type: 'unitCost', mul: 0.5, units: ['catapult'] },
        { type: 'moveCost', terrain: ['forest'], set: 1 },
        { type: 'moveCost', terrain: ['water'], moveTypes: ['foot'], set: 3 },
        { type: 'moveCost', terrain: ['plains'], moveTypes: ['wheeled'], set: null },
        { type: 'terrainDefense', terrain: ['forest'], add: 1 },
        { type: 'terrainDefense', ownBuildings: true, add: 2 },
        { type: 'income', mul: 1.5, add: 10 },
        { type: 'heal', buildings: 1, anywhere: 1 },
        { type: 'captureStrength', add: 1, units: ['pikeman'] },
        { type: 'damageVs', mul: 2, units: ['pikeman'], vs: { tags: ['cavalry'] } },
      ],
    },
  ],
  roster: { replace: { archer: 'battlemage' }, add: ['scout'], remove: ['catapult'] },
};

beforeAll(() => {
  loadContent([BASE_LAYER, { source: 'test', pack: { factions: [tester] } }]);
});
afterAll(() => {
  loadContent([BASE_LAYER]);
});

const rows = ['.f~...', '......'];
function game(units: MapUnitPlacement[] = [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 5, y: 1 }], buildings = [] as { type: string; x: number; y: number; owner: number | null }[]) {
  return makeGame(rows, units, { players: [{ faction: 'tester', controller: 'human' }, { faction: 'ember', controller: 'ai' }] }, { buildings });
}

describe('unit stats', () => {
  it('apply adds, multipliers and filters by id or tag', () => {
    expect(unitStatsFor('tester', 'rider').attack).toBe(9);
    expect(unitStatsFor('tester', 'scout').attack).toBe(5); // also cavalry
    expect(unitStatsFor('tester', 'pikeman').move).toBe(6);
    expect(unitStatsFor('tester', 'archer').range).toEqual([2, 3]);
    expect(unitStatsFor('tester', 'catapult').cost).toBe(200);
    expect(unitStatsFor('ember', 'rider').attack).toBe(7); // other factions unaffected
  });

  it('are used for units in play', () => {
    const s = game([{ type: 'rider', owner: 0, x: 0, y: 0 }, { type: 'rider', owner: 1, x: 5, y: 1 }]);
    expect(statsOf(s, s.units[0]).attack).toBe(9);
    expect(statsOf(s, s.units[1]).attack).toBe(7);
  });
});

describe('terrain effects', () => {
  it('change movement costs, including making terrain passable or impassable', () => {
    const s = game();
    expect(moveCostFor(s, 0, 'mounted', 1, 0)).toBe(1); // forest normally 2
    expect(moveCostFor(s, 1, 'mounted', 1, 0)).toBe(2);
    expect(moveCostFor(s, 0, 'foot', 2, 0)).toBe(3); // wading rivers
    expect(moveCostFor(s, 0, 'mounted', 2, 0)).toBeUndefined();
    expect(moveCostFor(s, 0, 'wheeled', 3, 0)).toBeUndefined(); // plains closed to wheels
  });

  it('add defense on chosen terrain and on own buildings', () => {
    const s = game(undefined, [{ type: 'village', x: 4, y: 0, owner: 0 }, { type: 'village', x: 5, y: 0, owner: 1 }]);
    const u = s.units[0];
    expect(defenseBonus(s, u, { x: 1, y: 0 })).toBe(3); // forest 2 + perk 1
    expect(defenseBonus(s, u, { x: 4, y: 0 })).toBe(4); // village 2 + own building 2
    expect(defenseBonus(s, u, { x: 5, y: 0 })).toBe(2); // enemy village: no perk
    expect(defenseBonus(s, s.units[1], { x: 1, y: 0 })).toBe(2);
  });
});

describe('economy effects', () => {
  it('scale income', () => {
    const s = game(undefined, [{ type: 'village', x: 4, y: 0, owner: 0 }, { type: 'village', x: 5, y: 0, owner: 0 }]);
    expect(incomeOf(s, 0)).toBe(160); // 100 * 1.5 + 10
  });

  it('heal on buildings and in the field', () => {
    const s = game(
      [{ type: 'pikeman', owner: 0, x: 4, y: 0, hp: 3 }, { type: 'pikeman', owner: 0, x: 0, y: 1, hp: 3 }, { type: 'pikeman', owner: 1, x: 5, y: 1 }],
      [{ type: 'village', x: 4, y: 0, owner: 0 }],
    );
    expect(healAmount(s, s.units[0])).toBe(3);
    expect(healAmount(s, s.units[1])).toBe(1);
    expect(healAmount(s, s.units[2])).toBe(0);
  });

  it('boost capture strength', () => {
    const s = game();
    expect(captureStrength(s, s.units[0])).toBe(3);
    expect(captureStrength(s, s.units[1])).toBe(2);
  });
});

describe('combat effects', () => {
  it('multiply damage against matching targets', () => {
    const s = game([{ type: 'pikeman', owner: 0, x: 0, y: 1 }, { type: 'rider', owner: 1, x: 1, y: 1 }]);
    expect(damageMultiplier(s, s.units[0], s.units[1])).toBe(3); // 1.5 base x 2 perk
    expect(baseDamage(s, s.units[0], 10, s.units[1])).toBe(12); // 5 * 3 * 0.8
  });
});

describe('rosters', () => {
  it('replace, add and remove units at barracks', () => {
    const s = game();
    const roster = rosterFor(s, 0, 'barracks');
    expect(roster).toContain('battlemage');
    expect(roster).not.toContain('archer');
    expect(roster).not.toContain('catapult');
    expect(roster).toContain('scout');
    expect(rosterFor(s, 1, 'barracks')).toContain('archer');
    expect(rosterFor(s, 0, 'village')).toEqual([]);
  });

  it('swap starting units on maps', () => {
    const s = game([{ type: 'archer', owner: 0, x: 0, y: 1 }, { type: 'archer', owner: 1, x: 5, y: 1 }]);
    expect(s.units.map((u) => u.type)).toEqual(['battlemage', 'archer']);
  });

  it('only allow building units from the faction roster', () => {
    const s = makeGame(rows, [{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 5, y: 1 }], {
      players: [{ faction: 'tester', controller: 'human' }, { faction: 'ember', controller: 'ai' }],
    }, { buildings: [{ type: 'barracks', x: 3, y: 1, owner: 0 }], startingGold: 1000 });
    expect(() => applyOrThrow(s, { type: 'build', buildingId: 1, unitType: 'archer' })).toThrow();
    const r = applyOrThrow(s, { type: 'build', buildingId: 1, unitType: 'scout' });
    expect(getUnit(r.state, 3)!.type).toBe('scout');
  });
});
