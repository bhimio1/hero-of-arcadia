// AI-vs-AI games on the open maps must finish, using only legal actions.
import { describe, expect, it } from 'vitest';
import { playAiGame } from './testkit';

describe('AI vs AI', () => {
  for (const [mapId, seed] of [['greenvale', 1], ['greenvale', 2], ['first-ford', 1], ['four-crowns', 1]] as const) {
    it(`${mapId} (seed ${seed}) plays to a finish`, () => {
      const state = playAiGame(mapId, seed);
      expect(state.gameOver, `stalled at round ${state.round}`).toBe(true);
    });
  }
});
