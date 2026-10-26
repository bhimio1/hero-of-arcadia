// AI-vs-AI games on the fog maps: the AIs only ever see their own player view.
import { describe, expect, it } from 'vitest';
import { playAiGame } from './testkit';

describe('AI vs AI in fog', () => {
  for (const mapId of ['highland-pass', 'wildwood'] as const) {
    it(`${mapId} plays to a finish`, () => {
      const state = playAiGame(mapId, 1);
      expect(state.gameOver, `stalled at round ${state.round}`).toBe(true);
    });
  }
});
