// The example mods in public/mods must load cleanly (content and sprites) on their own and
// together, and what they add must be playable by the AI.
import { afterEach, describe, expect, it } from 'vitest';
import { GreedyAi } from '../core/ai/greedy';
import { playAiGame, playTurn } from '../core/ai/testkit';
import { BIOMES, FACTIONS, MAPS, RULES, UNITS, validateMap } from '../core/data';
import { applyMods, MOD_FORMAT, parseMod, resolveMods, type ModManifest } from '../core/mods';
import { generateMap } from '../core/procgen';
import { createGame } from '../core/state';
import { checkModSprites, modSpriteCheck, SPRITES, setModSprites } from './gfx/spriteData';

const files = import.meta.glob<unknown>('../../public/mods/*.json', { eager: true, import: 'default' });
const index = files['../../public/mods/index.json'] as { mods: string[] };
const bundled: ModManifest[] = index.mods.map((file) => parseMod(files[`../../public/mods/${file}`]));
const byId = (id: string) => bundled.find((m) => m.id === id)!;

afterEach(() => {
  applyMods([]);
  setModSprites([]);
});

describe('bundled mods', () => {
  it('are listed in index.json and parse', () => {
    expect(bundled.map((m) => m.id).sort()).toEqual(['frost-giants', 'iron-rules', 'marshlands']);
  });

  for (const m of bundled) {
    it(`${m.id} loads on its own with valid sprites`, () => {
      expect(checkModSprites(m)).toEqual([]);
      const res = resolveMods([m], modSpriteCheck);
      expect(res.failed.flatMap((f) => f.issues)).toEqual([]);
      expect(res.warnings).toEqual([]);
    });
  }

  it('all load together', () => {
    const res = applyMods(bundled, modSpriteCheck);
    expect(res.failed).toEqual([]);
    expect(Object.keys(FACTIONS)).toContain('frost');
    expect(Object.keys(MAPS)).toContain('mirefen');
    expect(Object.keys(MAPS)).not.toContain('greenvale');
  });

  it('frost-giants: the Frost Kin field giants under AI control', () => {
    applyMods([byId('frost-giants')], modSpriteCheck);
    setModSprites([byId('frost-giants')]);
    expect(SPRITES['units/giant']).toBeDefined();
    let state = createGame({
      mapId: 'first-ford',
      seed: 3,
      players: [
        { faction: 'frost', controller: 'ai' },
        { faction: 'cobalt', controller: 'ai' },
      ],
    });
    // plenty of gold so the AI can afford its most expensive unit early
    state.players[0].gold = 3000;
    const ai = new GreedyAi();
    while (!state.gameOver && state.round <= 8) state = playTurn(state, ai).state;
    expect(state.players[0].stats.built).toBeGreaterThan(0);
  });

  it('marshlands: Mirefen and generated fenlands play to a finish', () => {
    applyMods([byId('marshlands')], modSpriteCheck);
    expect(playAiGame('mirefen', 1).gameOver).toBe(true);
    const map = generateMap({ seed: 5, size: 'small', players: 2, biome: 'fenlands', buildings: 'normal' });
    expect(() => validateMap(map)).not.toThrow();
    expect(map.rows.join('')).toContain('m');
    expect(playAiGame(map, 5).gameOver).toBe(true);
  });

  it('iron-rules: patches only the named fields', () => {
    const before = { ...UNITS.catapult };
    applyMods([byId('iron-rules')], modSpriteCheck);
    expect(UNITS.catapult).toEqual({ ...before, cost: 500 });
    expect(RULES.startingGold).toBe(200);
    expect(MAPS.greenvale).toBeUndefined();
    expect(Object.keys(BIOMES)).toHaveLength(5);
  });
});

describe('mod sprites', () => {
  const unitMod = (sprites: Record<string, unknown>, unit: Record<string, unknown> = {}): ModManifest => ({
    format: MOD_FORMAT,
    id: 'golems',
    name: 'Golems',
    version: '1',
    content: { units: [{ ...UNITS.pikeman, id: 'golem', name: 'Golem', ...unit }] },
    sprites,
  });
  const grid = (ch = 'k') => Array.from({ length: 16 }, () => ch.repeat(16));

  it('a new unit needs a sprite of its own or an existing one', () => {
    const issues = resolveMods([unitMod({})], modSpriteCheck).failed[0].issues;
    expect(issues).toEqual([{ path: 'units.golem', message: expect.stringMatching(/has no sprite: add "units\/golem"/) }]);
    expect(resolveMods([unitMod({}, { sprite: 'pikeman' })], modSpriteCheck).failed).toEqual([]);
    expect(resolveMods([unitMod({ 'units/golem': { frames: { idle: [grid()], attack: [grid()] } } })], modSpriteCheck).failed).toEqual([]);
  });

  it('reports malformed sprites', () => {
    const messages = (sprites: Record<string, unknown>) => checkModSprites(unitMod(sprites)).map((i) => i.message);
    expect(messages({ 'monsters/golem': { frames: {} } })[0]).toMatch(/key must look like/);
    expect(messages({ 'units/golem': {} })[0]).toMatch(/needs "frames"/);
    expect(messages({ 'units/golem': { frames: { idle: [grid().slice(1)], attack: [grid()] } } })[0]).toMatch(/16 rows of 16/);
    expect(messages({ 'units/golem': { frames: { idle: [grid()] } } })).toEqual(['needs an "attack" animation']);
    expect(messages({ 'units/golem': { frames: { idle: [grid('Q')], attack: [grid()] } } })[0]).toMatch(/unknown char "Q"/);
    expect(messages({ 'units/golem': { legend: { Q: 99 }, frames: { idle: [grid('Q')], attack: [grid()] } } })[0]).toMatch(/palette index/);
  });
});
