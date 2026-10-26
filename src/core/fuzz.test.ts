// Plays random legal actions and checks invariants that must always hold.
import { describe, expect, it } from 'vitest';
import { getUnitDef, MAPS } from './data';
import { listLegalActions } from './legal';
import { applyAction } from './rules';
import { Rng } from './rng';
import { createGame } from './state';
import type { GameState } from './types';

function checkInvariants(s: GameState): void {
  const seen = new Set<string>();
  for (const u of s.units) {
    const key = `${u.x},${u.y}`;
    expect(seen.has(key), `two units on ${key}`).toBe(false);
    seen.add(key);
    expect(u.hp).toBeGreaterThan(0);
    expect(u.hp).toBeLessThanOrEqual(getUnitDef(u.type).maxHp);
    expect(u.x >= 0 && u.y >= 0 && u.x < s.width && u.y < s.height).toBe(true);
  }
  const ids = s.units.map((u) => u.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(s.players[s.currentPlayer].eliminated && !s.gameOver).toBe(false);
  // state must survive a JSON round-trip unchanged
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
}

describe('fuzz', () => {
  for (const mapId of Object.keys(MAPS)) {
    it(`random legal play on ${mapId} keeps the state consistent`, () => {
      const rng = new Rng(42);
      let s = createGame({ mapId, seed: 7, luck: true });
      for (let step = 0; step < 1500 && !s.gameOver; step++) {
        const actions = listLegalActions(s);
        // bias toward unit actions so the game actually progresses
        const pick = actions.length > 1 && rng.float() < 0.97 ? actions[rng.int(0, actions.length - 2)] : actions[actions.length - 1];
        const res = applyAction(s, pick);
        expect(res.ok, res.ok ? '' : res.error).toBe(true);
        if (res.ok) s = res.state;
        if (step % 25 === 0) checkInvariants(s);
      }
      checkInvariants(s);
    });
  }
});
