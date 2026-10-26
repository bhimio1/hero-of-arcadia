import { afterEach, describe, expect, it } from 'vitest';
import { BASE_LAYER, getUnitDef, loadContent, MAPS, UNITS } from './data';
import { ACTIVE_MODS, applyMods, modSummary, MOD_FORMAT, ModError, parseMod, resolveMods, type ModManifest } from './mods';
import { newMatch } from './match';
import { makeSave, MemoryStorage, parseSave, SaveError, SaveStore, serializeSave } from './save';

const mod = (id: string, extra: Partial<ModManifest> = {}): ModManifest => ({ format: MOD_FORMAT, id, name: `Mod ${id}`, version: '1.0.0', ...extra });

const golem = () => ({ ...getUnitDef('pikeman'), id: 'golem', name: 'Golem', attack: 8, sprite: 'pikeman' });

afterEach(() => {
  applyMods([]);
  loadContent([BASE_LAYER]);
});

describe('parseMod', () => {
  it('accepts a minimal mod, from text or an object', () => {
    const m = mod('tiny', { content: { rules: { luckMax: 2 } } });
    expect(parseMod(JSON.stringify(m))).toEqual(m);
    expect(parseMod(m)).toEqual(m);
  });

  it('explains what is wrong with a bad file', () => {
    const bad = (v: unknown) => () => parseMod(v);
    expect(bad('{oops')).toThrow(/not valid JSON/);
    expect(bad([])).toThrow(/not a mod/);
    expect(bad({ ...mod('x'), format: 'zip' })).toThrow(/"format"/);
    expect(bad({ ...mod('x'), id: 'Has Spaces' })).toThrow(/"id"/);
    expect(bad({ ...mod('x'), name: '' })).toThrow(/"name"/);
    expect(bad({ ...mod('x'), version: undefined })).toThrow(/"version"/);
    expect(bad({ ...mod('x'), content: { monsters: [] } })).toThrow(/unknown content section "monsters"/);
    expect(bad({ ...mod('x'), remove: { spells: ['fireball'] } })).toThrow(/unknown category "spells"/);
    expect(bad({ ...mod('x'), requires: 'other' })).toThrow(/"requires"/);
    expect(bad({ ...mod('x'), sprites: [] })).toThrow(ModError);
  });

  it('summarises what a mod contains', () => {
    const m = mod('s', { content: { units: [golem()], factions: [], rules: {} }, remove: { maps: ['greenvale'] }, sprites: { 'units/golem': {} } });
    expect(modSummary(m)).toEqual(['1 unit', 'rule changes', '1 sprite', 'removes 1']);
  });
});

describe('loading mods', () => {
  it('applies mods in order: later mods win', () => {
    const a = mod('a', { content: { units: [{ id: 'archer', attack: 7 }] } });
    const b = mod('b', { content: { units: [{ id: 'archer', attack: 9 }] } });
    applyMods([a, b]);
    expect(UNITS.archer.attack).toBe(9);
    applyMods([b, a]);
    expect(UNITS.archer.attack).toBe(7);
    expect(ACTIVE_MODS.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('leaves out a broken mod with the reasons and still loads the others', () => {
    const broken = mod('broken', { content: { units: [{ ...golem(), cost: -5 }] } });
    const good = mod('good', { content: { units: [golem()] } });
    const res = applyMods([broken, good]);
    expect(res.loaded.map((m) => m.id)).toEqual(['good']);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].mod.id).toBe('broken');
    expect(res.failed[0].issues.map((i) => i.path)).toContain('units.golem.cost');
    expect(UNITS.golem.cost).toBe(getUnitDef('pikeman').cost);
  });

  it('checks that required mods are loaded first', () => {
    const base = mod('base-pack', { content: { units: [golem()] } });
    const addon = mod('addon', { requires: ['base-pack'], content: { units: [{ id: 'golem', attack: 10 }] } });
    expect(resolveMods([addon, base]).failed.map((f) => f.issues[0].message)).toEqual(['needs base-pack turned on and loaded before it']);
    const ok = resolveMods([base, addon]);
    expect(ok.failed).toEqual([]);
    expect(ok.content.units.golem.attack).toBe(10);
  });

  it('rejects the same mod twice', () => {
    const res = resolveMods([mod('twin'), mod('twin')]);
    expect(res.loaded).toHaveLength(1);
    expect(res.failed[0].issues[0].message).toMatch(/twice/);
  });

  it('removes content and lets a host veto a mod', () => {
    const res = resolveMods([mod('cut', { remove: { maps: ['greenvale'] } })]);
    expect(res.content.maps.greenvale).toBeUndefined();
    const vetoed = resolveMods([mod('veto')], () => [{ path: 'sprites', message: 'nope' }]);
    expect(vetoed.loaded).toEqual([]);
    expect(vetoed.failed[0].issues).toEqual([{ path: 'sprites', message: 'nope' }]);
  });

  it('refuses a mod that leaves nothing to play', () => {
    const everything = { maps: Object.keys(MAPS), biomes: ['temperate', 'woodland', 'highlands', 'riverlands', 'steppe'] };
    const res = resolveMods([mod('void', { remove: everything })]);
    expect(res.failed[0].issues.at(-1)?.message).toMatch(/nothing to play/);
  });
});

describe('saves and mods', () => {
  it('records active mods and explains which are missing when loading', () => {
    const giants = mod('giants', { name: 'Giants', content: { units: [golem()] } });
    applyMods([giants]);
    const match = newMatch({ mapId: 'first-ford', seed: 1 });
    match.state.units[0].type = 'golem'; // as if a golem had been raised
    const save = makeSave(match);
    expect(save.mods).toEqual([{ id: 'giants', name: 'Giants', version: '1.0.0' }]);
    const json = serializeSave(save);
    expect(() => parseSave(json)).not.toThrow();

    applyMods([]);
    expect(() => parseSave(json)).toThrow(SaveError);
    try {
      parseSave(json);
    } catch (e) {
      expect((e as SaveError).message).toBe('save needs mods: Giants');
      expect((e as SaveError).missingMods).toEqual(['Giants']);
    }
    const store = new SaveStore(new MemoryStorage());
    store.write('slot1', save);
    expect(store.list().find((s) => s.id === 'slot1')?.missingMods).toEqual(['Giants']);
  });

  it('saves made without mods carry no mod list', () => {
    expect(makeSave(newMatch({ mapId: 'first-ford', seed: 1 })).mods).toBeUndefined();
  });
});
