import { describe, expect, it } from 'vitest';
import { FACTIONS } from './data';
import { describeEffect, describeFaction, describePerk } from './describe';

describe('descriptions', () => {
  it('turn effects into readable sentences', () => {
    expect(describeEffect({ type: 'unitStat', stat: 'attack', add: 1, tags: ['cavalry'] })).toBe('+1 attack for cavalry');
    expect(describeEffect({ type: 'unitCost', units: ['pikeman'], add: -20 })).toBe('Pikemen cost 20 less');
    expect(describeEffect({ type: 'unitCost', tags: ['siege'], mul: 0.75 })).toBe('siege cost 25% less');
    expect(describeEffect({ type: 'income', mul: 1.25 })).toBe('+25% income');
    expect(describeEffect({ type: 'moveCost', terrain: ['water'], moveTypes: ['foot'], set: 3 })).toBe('river costs 3 move for foot units');
    expect(describeEffect({ type: 'moveCost', terrain: ['plains'], set: null })).toBe('all units cannot enter plains');
    expect(describeEffect({ type: 'terrainDefense', ownBuildings: true, add: 2 })).toBe('+2 defense on your own buildings for all units');
    expect(describeEffect({ type: 'heal', anywhere: 1, buildings: 1 })).toBe('units heal 1 HP per turn anywhere, 1 more on buildings');
    expect(describeEffect({ type: 'damageVs', mul: 1.5, units: ['archer'], vs: { tags: ['cavalry'] } })).toBe('+50% damage by Archers against cavalry');
  });

  it('prefers a perk’s own description', () => {
    expect(describePerk({ name: 'X', desc: 'Custom.', effects: [] })).toBe('Custom.');
    expect(describePerk({ name: 'X', effects: [{ type: 'income', add: 50 }] })).toBe('+50 income.');
  });

  it('every bundled faction has perks and a summary', () => {
    expect(Object.keys(FACTIONS).length).toBeGreaterThanOrEqual(8);
    for (const f of Object.values(FACTIONS)) {
      if (f.id === 'alpha' || f.id === 'beta') continue;
      expect(describeFaction(f).length, f.id).toBeGreaterThan(0);
    }
    expect(describeFaction(FACTIONS.moss)).toContain('Ranger replaces the Archer.');
  });
});
