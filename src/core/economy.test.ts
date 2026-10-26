import { describe, expect, it } from 'vitest';
import { buildActions } from './legal';
import { applyAction, applyOrThrow } from './rules';
import { getBuilding, getUnit, terrainAt, unitAt } from './state';
import { makeGame } from './testing';
import type { GameState, MapBuildingPlacement, MapUnitPlacement } from './types';

const rows = ['......', '......', '......'];

function game(units: MapUnitPlacement[], buildings: MapBuildingPlacement[], startingGold = 0): GameState {
  return makeGame(rows, units, {}, { buildings, startingGold });
}

describe('buildings as terrain', () => {
  it('give defense and are walkable', () => {
    const s = game([{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 5, y: 2 }], [
      { type: 'keep', x: 1, y: 0, owner: 0 },
    ]);
    expect(terrainAt(s, 1, 0).defense).toBe(4);
    expect(terrainAt(s, 2, 0).defense).toBe(0);
    expect(applyAction(s, { type: 'move', unitId: 1, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }).ok).toBe(true);
  });
});

describe('income and healing', () => {
  it('pays each owned building at the start of its owner’s turn', () => {
    let s = game([{ type: 'pikeman', owner: 0, x: 0, y: 0 }, { type: 'pikeman', owner: 1, x: 5, y: 2 }], [
      { type: 'village', x: 2, y: 0, owner: 0 },
      { type: 'village', x: 3, y: 0, owner: 0 },
      { type: 'village', x: 4, y: 0, owner: 1 },
      { type: 'village', x: 4, y: 1, owner: null },
    ], 50);
    // player 0 collects for the first turn when the game is created (villages pay 50)
    expect(s.players[0].gold).toBe(150);
    expect(s.players[1].gold).toBe(50);
    const r = applyOrThrow(s, { type: 'endTurn' });
    s = r.state;
    expect(s.players[1].gold).toBe(100);
    expect(r.events).toContainEqual({ type: 'turnStarted', player: 1, round: 1, income: 50 });
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    expect(s.players[0].gold).toBe(250);
  });

  it('heals units on their own buildings, never above max', () => {
    let s = game([
      { type: 'pikeman', owner: 0, x: 0, y: 0, hp: 5 },
      { type: 'pikeman', owner: 0, x: 1, y: 0, hp: 9 },
      { type: 'pikeman', owner: 0, x: 2, y: 0, hp: 5 },
      { type: 'pikeman', owner: 1, x: 5, y: 2 },
    ], [
      { type: 'village', x: 0, y: 0, owner: 0 },
      { type: 'village', x: 1, y: 0, owner: 0 },
      { type: 'village', x: 2, y: 0, owner: 1 },
    ]);
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    expect(getUnit(s, 1)!.hp).toBe(7);
    expect(getUnit(s, 2)!.hp).toBe(10);
    expect(getUnit(s, 3)!.hp).toBe(5); // enemy village: no healing
  });
});

describe('capture', () => {
  const units: MapUnitPlacement[] = [
    { type: 'pikeman', owner: 0, x: 1, y: 0 },
    { type: 'rider', owner: 0, x: 0, y: 2 },
    { type: 'pikeman', owner: 1, x: 5, y: 2 },
  ];
  const buildings: MapBuildingPlacement[] = [
    { type: 'village', x: 1, y: 0, owner: null },
    { type: 'keep', x: 5, y: 0, owner: 1 },
    { type: 'village', x: 0, y: 2, owner: null },
  ];

  function nextRound(s: GameState): GameState {
    s = applyOrThrow(s, { type: 'endTurn' }).state;
    return applyOrThrow(s, { type: 'endTurn' }).state;
  }

  it('takes two turns for a healthy unit', () => {
    let s = game(units, buildings);
    const r = applyOrThrow(s, { type: 'capture', unitId: 1 });
    expect(r.events).toContainEqual({ type: 'captureProgress', buildingId: 1, unitId: 1, points: 2, required: 4 });
    s = nextRound(r.state);
    const r2 = applyOrThrow(s, { type: 'capture', unitId: 1 });
    expect(getBuilding(r2.state, 1)!.owner).toBe(0);
    expect(r2.state.players[0].stats.captured).toBe(1);
  });

  it('takes longer for a wounded unit', () => {
    let s = game([{ ...units[0], hp: 4 }, units[1], units[2]], buildings);
    for (let i = 0; i < 3; i++) {
      s = applyOrThrow(s, { type: 'capture', unitId: 1 }).state;
      expect(getBuilding(s, 1)!.owner).toBeNull();
      s = nextRound(s);
    }
    s = applyOrThrow(s, { type: 'capture', unitId: 1 }).state;
    expect(getBuilding(s, 1)!.owner).toBe(0);
  });

  it('resets when the capturing unit walks away', () => {
    let s = game(units, buildings);
    s = applyOrThrow(s, { type: 'capture', unitId: 1 }).state;
    s = nextRound(s);
    s = applyOrThrow(s, { type: 'move', unitId: 1, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }).state;
    expect(getBuilding(s, 1)!.capture).toBeNull();
  });

  it('only capturing units can capture, and only foreign buildings', () => {
    const s = game(units, buildings);
    expect(applyAction(s, { type: 'capture', unitId: 2 }).ok).toBe(false); // rider
    const owned = game(units, [{ type: 'village', x: 1, y: 0, owner: 0 }]);
    expect(applyAction(owned, { type: 'capture', unitId: 1 }).ok).toBe(false);
  });

  it('capturing the enemy keep wins the game', () => {
    let s = game([
      { type: 'pikeman', owner: 0, x: 5, y: 0 },
      { type: 'pikeman', owner: 1, x: 0, y: 2 },
      { type: 'pikeman', owner: 1, x: 1, y: 2 },
    ], [{ type: 'keep', x: 5, y: 0, owner: 1 }]);
    s = applyOrThrow(s, { type: 'capture', unitId: 1 }).state;
    s = nextRound(s);
    const r = applyOrThrow(s, { type: 'capture', unitId: 1 });
    expect(r.state.gameOver).toBe(true);
    expect(r.state.winner).toBe(0);
    expect(r.state.units.every((u) => u.owner === 0)).toBe(true);
  });
});

describe('production', () => {
  const units: MapUnitPlacement[] = [
    { type: 'pikeman', owner: 0, x: 0, y: 0 },
    { type: 'pikeman', owner: 1, x: 5, y: 2 },
  ];

  it('builds a unit that cannot act this turn and costs gold', () => {
    const s = game(units, [{ type: 'barracks', x: 2, y: 1, owner: 0 }], 300);
    expect(s.players[0].gold).toBe(350); // 300 + barracks income 50
    const r = applyOrThrow(s, { type: 'build', buildingId: 1, unitType: 'rider' });
    const built = unitAt(r.state, 2, 1)!;
    expect(built.type).toBe('rider');
    expect(built.acted).toBe(true);
    expect(r.state.players[0].gold).toBe(50);
    expect(r.state.players[0].stats.built).toBe(1);
    // the yard is now occupied
    expect(applyAction(r.state, { type: 'build', buildingId: 1, unitType: 'pikeman' }).ok).toBe(false);
    // and the new unit is ready next turn
    const next = applyOrThrow(applyOrThrow(r.state, { type: 'endTurn' }).state, { type: 'endTurn' }).state;
    expect(getUnit(next, built.id)!.acted).toBe(false);
  });

  it('rejects unaffordable, foreign or wrong-building orders', () => {
    const s = game(units, [
      { type: 'barracks', x: 2, y: 1, owner: 0 },
      { type: 'barracks', x: 3, y: 1, owner: 1 },
      { type: 'village', x: 4, y: 1, owner: 0 },
    ], 0);
    expect(s.players[0].gold).toBe(100);
    expect(applyAction(s, { type: 'build', buildingId: 1, unitType: 'catapult' }).ok).toBe(false);
    expect(applyAction(s, { type: 'build', buildingId: 2, unitType: 'pikeman' }).ok).toBe(false);
    expect(applyAction(s, { type: 'build', buildingId: 3, unitType: 'pikeman' }).ok).toBe(false);
    expect(buildActions(s, 1).map((a) => (a.type === 'build' ? a.unitType : ''))).toEqual(['pikeman']);
  });

  it('a player with no units but a barracks is still in the game', () => {
    const s = game([
      { type: 'rider', owner: 0, x: 0, y: 0 },
      { type: 'pikeman', owner: 1, x: 1, y: 0, hp: 1 },
    ], [{ type: 'barracks', x: 5, y: 2, owner: 1 }]);
    const r = applyOrThrow(s, { type: 'attack', unitId: 1, targetId: 2 });
    expect(r.state.gameOver).toBe(false);
    expect(r.state.players[1].eliminated).toBe(false);
  });
});
