import { describe, expect, it } from 'vitest';
import { baseDamage, previewAttack } from './combat';
import { applyAction, applyOrThrow } from './rules';
import { getUnit } from './state';
import { makeGame } from './testing';
import type { GameState, MapUnitPlacement } from './types';

const flat = ['......', '......', '......'];

function game(units: MapUnitPlacement[], luck = false, rows = flat): GameState {
  return makeGame(rows, units, { luck });
}

describe('damage formula', () => {
  it('scales with attack, defense, bonuses and attacker health', () => {
    const s = game([
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0 },
      { type: 'rider', owner: 0, x: 0, y: 1 },
      { type: 'archer', owner: 1, x: 3, y: 0 },
    ]);
    const [pike0, pike1, rider, archer] = s.units;
    expect(baseDamage(s, pike0, 10, pike1)).toBe(4); // 5 * 0.8
    expect(baseDamage(s, pike0, 5, pike1)).toBe(2); // half health -> 5 * 0.5 * 0.8
    expect(baseDamage(s, rider, 10, pike1)).toBe(6); // 7 * 0.8 = 5.6
    expect(baseDamage(s, pike1, 10, rider)).toBe(6); // pikes vs riders: 5 * 1.5 * 0.8
    expect(baseDamage(s, rider, 10, archer)).toBe(9); // 7 * 1.5 * 0.9 = 9.45
    expect(baseDamage(s, pike0, 0, pike1)).toBe(0);
  });
});

describe('attack action', () => {
  it('damages the target and takes a counterattack', () => {
    const s = game([
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0 },
    ]);
    const { state, events } = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 });
    expect(getUnit(state, 2)!.hp).toBe(6);
    expect(getUnit(state, 1)!.hp).toBe(8); // counter: 5 * 0.6 * 0.8 = 2.4 -> 2
    expect(getUnit(state, 1)!.acted).toBe(true);
    expect(events.filter((e) => e.type === 'attacked')).toHaveLength(2);
  });

  it('ranged attackers are safe from melee counters, and cannot hit adjacent targets', () => {
    const s = game([
      { type: 'archer', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 2, y: 0 },
      { type: 'pikeman', owner: 1, x: 0, y: 1 },
    ]);
    const { state } = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 });
    expect(getUnit(state, 2)!.hp).toBe(5); // 5 * 1.2 * 0.8 = 4.8 -> 5
    expect(getUnit(state, 1)!.hp).toBe(10);
    expect(applyAction(s, { type: 'attack', unitId: 1, targetId: 3 }).ok).toBe(false);
  });

  it('catapults cannot move and fire, and never counter', () => {
    const s = game([
      { type: 'catapult', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 3, y: 0 },
      { type: 'pikeman', owner: 0, x: 5, y: 2 },
      { type: 'catapult', owner: 1, x: 4, y: 2 },
    ]);
    const moved = applyOrThrow(s, { type: 'move', unitId: 1, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }).state;
    expect(applyAction(moved, { type: 'attack', unitId: 1, targetId: 2 }).ok).toBe(false);
    expect(applyAction(s, { type: 'attack', unitId: 1, targetId: 2 }).ok).toBe(true);
    const hit = applyOrThrow(s, { type: 'attack', unitId: 3, targetId: 4 }).state;
    expect(getUnit(hit, 3)!.hp).toBe(10);
  });

  it('removes dead units without a counter and records stats', () => {
    const s = game([
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0, hp: 3 },
      { type: 'pikeman', owner: 1, x: 5, y: 2 },
    ]);
    const { state, events } = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 });
    expect(getUnit(state, 2)).toBeUndefined();
    expect(getUnit(state, 1)!.hp).toBe(10);
    expect(events).toContainEqual({ type: 'died', unitId: 2, owner: 1, x: 1, y: 0 });
    expect(state.players[0].stats.kills).toBe(1);
    expect(state.players[1].stats.losses).toBe(1);
  });

  it('rejects attacks on friends, out of range, or twice', () => {
    const s = game([
      { type: 'pikeman', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 0, x: 1, y: 0 },
      { type: 'pikeman', owner: 1, x: 3, y: 0 },
      { type: 'pikeman', owner: 1, x: 0, y: 1 },
    ]);
    expect(applyAction(s, { type: 'attack', unitId: 1, targetId: 2 }).ok).toBe(false);
    expect(applyAction(s, { type: 'attack', unitId: 1, targetId: 3 }).ok).toBe(false);
    const once = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 4 }).state;
    expect(applyAction(once, { type: 'attack', unitId: 1, targetId: 4 }).ok).toBe(false);
  });
});

describe('preview', () => {
  it('matches the real outcome', () => {
    const s = game([
      { type: 'rider', owner: 0, x: 0, y: 0, hp: 7 },
      { type: 'pikeman', owner: 1, x: 1, y: 0 },
    ]);
    const p = previewAttack(s, s.units[0], s.units[1]);
    const after = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 }).state;
    expect(p.damage).toEqual([10 - getUnit(after, 2)!.hp, 10 - getUnit(after, 2)!.hp]);
    expect(p.counter).not.toBeNull();
    expect(p.attackerHpAfter[0]).toBe(getUnit(after, 1)!.hp);
  });

  it('gives a range when luck is on, and the roll stays inside it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeGame(flat, [
        { type: 'pikeman', owner: 0, x: 0, y: 0 },
        { type: 'pikeman', owner: 1, x: 1, y: 0 },
      ], { luck: true, seed });
      const p = previewAttack(s, s.units[0], s.units[1]);
      expect(p.damage).toEqual([4, 5]);
      const after = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 }).state;
      const dealt = 10 - getUnit(after, 2)!.hp;
      expect(dealt).toBeGreaterThanOrEqual(4);
      expect(dealt).toBeLessThanOrEqual(5);
      expect(after.rng).not.toBe(s.rng);
    }
  });
});

describe('threat tiles', () => {
  it('covers range from every origin for move-and-fire units, only from the current tile otherwise', async () => {
    const { threatTiles } = await import('./combat');
    const s = game([
      { type: 'pikeman', owner: 0, x: 2, y: 1 },
      { type: 'catapult', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 5, y: 2 },
    ]);
    const pikeThreat = threatTiles(s, s.units[0], [{ x: 2, y: 1 }, { x: 3, y: 1 }]);
    expect(pikeThreat).toHaveLength(8); // two plus-shapes of 4, each containing the other origin
    const catThreat = threatTiles(s, s.units[1], [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    // range 2-3 from (0,0) on a 6x3 board
    expect(catThreat.every((c) => c.x + c.y >= 2 && c.x + c.y <= 3)).toBe(true);
  });
});
