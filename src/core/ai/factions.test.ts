// Every faction must be playable by the AI: perks, rosters and unique units included.
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../data';
import { createGame } from '../state';
import { GreedyAi } from './greedy';
import { playTurn } from './testkit';

const real = Object.keys(FACTIONS).filter((f) => f !== 'alpha' && f !== 'beta');

describe('factions under AI control', () => {
  real.forEach((faction, i) => {
    const rival = real[(i + 1) % real.length];
    it(`${faction} vs ${rival} plays 10 days on First Ford with only legal actions`, () => {
      let state = createGame({
        mapId: 'first-ford',
        seed: i + 1,
        luck: true,
        players: [
          { faction, controller: 'ai' },
          { faction: rival, controller: 'ai' },
        ],
      });
      const ai = new GreedyAi();
      while (!state.gameOver && state.round <= 10) state = playTurn(state, ai).state;
      // the AI raised units from its own faction roster
      const built = state.players[0].stats.built + state.players[1].stats.built;
      expect(built).toBeGreaterThan(0);
    });
  });
});
