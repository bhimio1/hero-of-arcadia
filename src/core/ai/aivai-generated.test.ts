// AI-vs-AI games on generated maps must finish, using only legal actions.
import { describe, expect, it } from 'vitest';
import { generateMap, type GenOptions } from '../procgen';
import { playAiGame } from './testkit';

const CASES: GenOptions[] = [
  { seed: 11, size: 'small', players: 2, biome: 'temperate', buildings: 'normal', factions: ['cobalt', 'ember'] },
  { seed: 12, size: 'medium', players: 2, biome: 'riverlands', buildings: 'many', factions: ['tide', 'ivory'] },
  { seed: 13, size: 'small', players: 4, biome: 'highlands', buildings: 'few', factions: ['moss', 'violet', 'fen', 'amber'] },
  { seed: 14, size: 'small', players: 2, biome: 'woodland', buildings: 'normal', factions: ['fen', 'moss'] },
];

describe('AI vs AI on generated maps', () => {
  for (const o of CASES) {
    it(`${o.biome} ${o.size} ${o.players}p (seed ${o.seed}) plays to a finish`, () => {
      const state = playAiGame(generateMap(o), o.seed);
      expect(state.gameOver, `stalled at round ${state.round}`).toBe(true);
    });
  }
});
