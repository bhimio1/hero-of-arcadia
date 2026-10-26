import { describe, expect, it } from 'vitest';
import { GreedyAi } from './ai/greedy';
import { dispatch, newMatch, type Match } from './match';
import { generateMap } from './procgen';
import {
  makeSave,
  MemoryStorage,
  parseSave,
  replay,
  restoreMatch,
  SaveError,
  SaveStore,
  serializeSave,
  verifySave,
} from './save';

/** A match a few days in, played by the AI on both sides with luck on (so the RNG matters). */
function playedMatch(days = 4): Match {
  const match = newMatch({
    mapId: 'first-ford',
    seed: 'save-test',
    luck: true,
    players: [
      { faction: 'cobalt', controller: 'ai' },
      { faction: 'ember', controller: 'ai' },
    ],
  });
  const ai = new GreedyAi();
  while (match.state.round <= days && !match.state.gameOver) {
    const res = dispatch(match, ai.nextAction(match.state));
    if (!res.ok) throw new Error(res.error);
  }
  return match;
}

describe('save / load', () => {
  it('round-trips through JSON without changing the state', () => {
    const match = playedMatch();
    const save = makeSave(match, new Date('2026-01-02T03:04:05Z'));
    const loaded = parseSave(serializeSave(save));
    expect(loaded.snapshot).toEqual(match.state);
    expect(loaded.actions).toEqual(match.actions);
    expect(loaded.label).toBe('First Ford - Day 5');
    const restored = restoreMatch(loaded);
    expect(restored.state).toEqual(match.state);
    expect(restored.undoFloor).toBe(match.actions.length);
  });

  it('replaying seed + action log reproduces the exact state', () => {
    const match = playedMatch(10);
    // make sure the log exercises the luck RNG, captures and production
    for (const type of ['attack', 'capture', 'build']) expect(match.actions.some((a) => a.type === type), type).toBe(true);
    expect(replay(match.setup, match.actions)).toEqual(match.state);
    expect(verifySave(makeSave(match))).toBe(true);
  });

  it('detects a tampered snapshot', () => {
    const save = makeSave(playedMatch(2));
    save.snapshot.players[0].gold += 1000;
    expect(verifySave(save)).toBe(false);
  });

  it('a restored match keeps playing identically', () => {
    const a = playedMatch(2);
    const b = restoreMatch(parseSave(serializeSave(makeSave(a))));
    const ai = new GreedyAi();
    for (let i = 0; i < 40 && !a.state.gameOver; i++) {
      const action = ai.nextAction(a.state);
      dispatch(a, action);
      dispatch(b, action);
    }
    expect(b.state).toEqual(a.state);
  });

  it('rejects garbage, other formats, wrong versions and unknown maps', () => {
    const good = serializeSave(makeSave(playedMatch(1)));
    expect(() => parseSave('{not json')).toThrow(SaveError);
    expect(() => parseSave('{"format":"something-else"}')).toThrow(/not a Hero of Arcadia save/);
    expect(() => parseSave(good.replace('"version":1', '"version":99'))).toThrow(/version/);
    const obj = JSON.parse(good);
    obj.setup.mapId = 'atlantis';
    expect(() => parseSave(JSON.stringify(obj))).toThrow(/unknown map/);
    delete obj.snapshot;
    expect(() => parseSave(JSON.stringify(obj))).toThrow(/incomplete/);
  });
});

describe('saves on generated maps', () => {
  it('carry the map with them and replay exactly', () => {
    const map = generateMap({ seed: 77, size: 'small', players: 2, biome: 'riverlands', buildings: 'normal' });
    const match = newMatch({ mapId: map.id, map, seed: 5, luck: true, players: map.players.map((p) => ({ ...p, controller: 'ai' })) });
    const ai = new GreedyAi();
    while (match.state.round <= 4 && !match.state.gameOver) dispatch(match, ai.nextAction(match.state));
    const loaded = parseSave(serializeSave(makeSave(match)));
    expect(loaded.label).toBe(`${map.name} - Day ${match.state.round}`);
    expect(loaded.setup.map).toEqual(map);
    expect(verifySave(loaded)).toBe(true);
  });

  it('are rejected when the map no longer fits the content', () => {
    const map = generateMap({ seed: 78, size: 'small', players: 2, biome: 'temperate', buildings: 'few' });
    const save = makeSave(newMatch({ mapId: map.id, map, seed: 1 }));
    save.setup.map!.buildings![0].type = 'wizard-tower';
    expect(() => parseSave(serializeSave(save))).toThrow(/does not fit/);
  });
});

describe('save slots', () => {
  it('writes, lists, reads and removes slots', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    expect(store.list().every((s) => s.save === null)).toBe(true);
    const save = makeSave(playedMatch(1));
    store.write('slot2', save);
    expect(store.read('slot2')).toEqual(save);
    expect(store.list().find((s) => s.id === 'slot2')!.save).toEqual(save);
    store.remove('slot2');
    expect(store.read('slot2')).toBeNull();
  });

  it('reports corrupt slots instead of crashing', () => {
    const storage = new MemoryStorage();
    storage.setItem('hero-of-arcadia.save.slot1', 'garbage');
    const info = new SaveStore(storage).list().find((s) => s.id === 'slot1')!;
    expect(info.save).toBeNull();
    expect(info.error).toBeTruthy();
  });
});
