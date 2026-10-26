// The player's mods: example mods shipped in public/mods (listed in mods/index.json), mods
// imported from files (kept in localStorage), which ones are on and their load order, and
// applying them to the running game.

import { applyMods, ModError, parseMod, resolveMods, type ModLoadResult, type ModManifest } from '../core/mods';
import { syncTeamColors } from './gfx/palette';
import { modSpriteCheck, setModSprites } from './gfx/spriteData';
import { storage } from './settings';

export type ModOrigin = 'bundled' | 'imported';

export interface ModRecord {
  mod: ModManifest;
  origin: ModOrigin;
}

export interface ModChoices {
  /** Mod ids in load order (mods not listed load after these, by name). */
  order: string[];
  /** Ids of mods that are turned on. */
  enabled: string[];
}

const CHOICES_KEY = 'hero-of-arcadia.mods';
const IMPORTED_KEY = 'hero-of-arcadia.mods.imported';

let bundled: ModRecord[] = [];
let lastResult: ModLoadResult | null = null;

/** Bundled mod files that could not be read, with the reason. */
export const bundleErrors: { file: string; message: string }[] = [];

/** Downloads the mods listed in `<base>/mods/index.json` ({ "mods": ["file.json", ...] }). */
export async function loadBundledMods(baseUrl: string = import.meta.env.BASE_URL): Promise<void> {
  bundled = [];
  bundleErrors.length = 0;
  let files: string[];
  try {
    const res = await fetch(`${baseUrl}mods/index.json`);
    if (!res.ok) return;
    const index = (await res.json()) as { mods?: unknown };
    files = Array.isArray(index.mods) ? index.mods.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return; // no bundled mods (or offline): the game runs without them
  }
  const records = await Promise.all(
    files.map(async (file): Promise<ModRecord | null> => {
      try {
        const res = await fetch(`${baseUrl}mods/${file}`);
        if (!res.ok) throw new ModError(`could not be downloaded (${res.status})`);
        return { mod: parseMod(await res.text()), origin: 'bundled' };
      } catch (e) {
        bundleErrors.push({ file, message: e instanceof Error ? e.message : String(e) });
        return null;
      }
    }),
  );
  bundled = records.filter((r): r is ModRecord => r !== null);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function importedMods(): ModRecord[] {
  const raw = readJson<unknown>(IMPORTED_KEY, []);
  const out: ModRecord[] = [];
  for (const m of Array.isArray(raw) ? raw : []) {
    try {
      out.push({ mod: parseMod(m), origin: 'imported' });
    } catch {
      // a damaged entry is skipped rather than blocking the rest
    }
  }
  return out;
}

/** Every known mod. An imported mod replaces a bundled one with the same id. */
export function availableMods(): ModRecord[] {
  const imported = importedMods();
  const ids = new Set(imported.map((r) => r.mod.id));
  return [...bundled.filter((r) => !ids.has(r.mod.id)), ...imported];
}

export function getModChoices(): ModChoices {
  const c = readJson<Partial<ModChoices>>(CHOICES_KEY, {});
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { order: strings(c.order), enabled: strings(c.enabled) };
}

export function setModChoices(c: ModChoices): void {
  try {
    storage.setItem(CHOICES_KEY, JSON.stringify(c));
  } catch {
    // storage blocked: the choice still applies until the page is closed
  }
}

/** Known mods in load order: the saved order first, then any others by name. */
export function orderedMods(choices: ModChoices = getModChoices()): ModRecord[] {
  const rank = (id: string) => {
    const i = choices.order.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  return availableMods().sort((a, b) => rank(a.mod.id) - rank(b.mod.id) || a.mod.name.localeCompare(b.mod.name));
}

export function enabledMods(choices: ModChoices = getModChoices()): ModManifest[] {
  return orderedMods(choices)
    .filter((r) => choices.enabled.includes(r.mod.id))
    .map((r) => r.mod);
}

/** Loads a set of mods without activating them, to see which would fail and why. */
export function tryMods(mods: ModManifest[]): ModLoadResult {
  return resolveMods(mods, modSpriteCheck);
}

/**
 * Activates the enabled mods: content, sprites and team colours. Textures still have to be
 * baked again afterwards (bakeAllSprites).
 */
export function activateMods(choices: ModChoices = getModChoices()): ModLoadResult {
  const res = applyMods(enabledMods(choices), modSpriteCheck);
  setModSprites(res.loaded);
  syncTeamColors();
  lastResult = res;
  for (const f of res.failed) console.warn(`mod "${f.mod.id}" was not loaded:`, f.issues);
  return res;
}

/** The result of the last activateMods() call. */
export function lastModResult(): ModLoadResult | null {
  return lastResult;
}

/** Stores a mod from a file the player picked. Throws ModError if it can't be used. */
export function importMod(text: string): ModManifest {
  const mod = parseMod(text);
  const list = importedMods()
    .filter((r) => r.mod.id !== mod.id)
    .map((r) => r.mod);
  list.push(mod);
  try {
    storage.setItem(IMPORTED_KEY, JSON.stringify(list));
  } catch {
    throw new ModError('there is no room left to store it');
  }
  return mod;
}

export function removeImportedMod(id: string): void {
  const list = importedMods()
    .filter((r) => r.mod.id !== id)
    .map((r) => r.mod);
  try {
    storage.setItem(IMPORTED_KEY, JSON.stringify(list));
  } catch {
    // nothing else to do: the mod stays until storage works again
  }
}

/**
 * Opens the file picker for a .json mod file and calls `onText` with the chosen file's
 * contents. Nothing happens if the picker is cancelled.
 */
export function pickModFile(onText: (text: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    void input.files?.[0]?.text().then(onText, () => onText(''));
  });
  input.click();
}
