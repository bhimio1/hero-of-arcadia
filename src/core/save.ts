// Save games. A save stores the setup (map + seed + options), the full action log and a
// snapshot of the current state. The snapshot makes loading instant; the log lets any
// save be replayed and verified from scratch.

import { BUILDINGS, FACTIONS, TERRAIN, UNITS, validateMap } from './data';
import type { Match } from './match';
import { ACTIVE_MODS, type ModStamp } from './mods';
import { applyAction } from './rules';
import { createGame, setupMap, STATE_VERSION, type GameSetup } from './state';
import type { Action, GameState } from './types';

export const SAVE_FORMAT = 'hero-of-arcadia-save';
export const SAVE_VERSION = 1;

export interface SaveData {
  format: typeof SAVE_FORMAT;
  version: number;
  /** ISO timestamp. */
  savedAt: string;
  /** Short human-readable description, e.g. "First Ford - Day 4". */
  label: string;
  setup: GameSetup;
  actions: Action[];
  snapshot: GameState;
  /** Mods that were active when the game was saved (missing = none). */
  mods?: ModStamp[];
}

export class SaveError extends Error {
  constructor(
    message: string,
    /** Names of mods the save was made with that are not active now, when that is why it can't load. */
    readonly missingMods: string[] = [],
  ) {
    super(message);
  }
}

/** Anything with the localStorage API (localStorage itself, or an in-memory fake in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function makeSave(match: Match, now = new Date()): SaveData {
  const map = setupMap(match.setup);
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    label: `${map.name} - Day ${match.state.round}`,
    setup: structuredClone(match.setup),
    actions: structuredClone(match.actions),
    snapshot: structuredClone(match.state),
    ...(ACTIVE_MODS.length ? { mods: structuredClone(ACTIVE_MODS) } : {}),
  };
}

/** Why a save's game can't be played with the active content, or null if it can. */
export function contentProblem(save: Pick<SaveData, 'setup' | 'snapshot'>): string | null {
  const s = save.snapshot;
  const missing = (kind: string, id: string) => `uses unknown ${kind} "${id}"`;
  try {
    if (save.setup.map) validateMap(save.setup.map);
    else setupMap(save.setup);
  } catch {
    return save.setup.map ? `has a map ("${save.setup.map.name}") that does not fit the current content` : missing('map', save.setup.mapId);
  }
  for (const p of s.players) if (!(p.faction in FACTIONS)) return missing('faction', p.faction);
  for (const u of s.units) if (!(u.type in UNITS)) return missing('unit', u.type);
  for (const b of s.buildings) if (!(b.type in BUILDINGS)) return missing('building', b.type);
  for (const t of new Set(s.terrain)) if (!(t in TERRAIN)) return missing('terrain', t);
  return null;
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

/** Parses and validates a save. Throws SaveError if it is not a usable save. */
export function parseSave(json: string): SaveData {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new SaveError('save file is not valid JSON');
  }
  const d = data as Partial<SaveData> | null;
  if (!d || typeof d !== 'object' || d.format !== SAVE_FORMAT) throw new SaveError('not a Hero of Arcadia save');
  if (d.version !== SAVE_VERSION) throw new SaveError(`unsupported save version ${String(d.version)}`);
  if (!d.setup || typeof d.setup.mapId !== 'string' || !Array.isArray(d.actions) || !d.snapshot) {
    throw new SaveError('save is incomplete');
  }
  if (d.snapshot.version !== STATE_VERSION) throw new SaveError('save was made by an incompatible version');
  const problem = contentProblem(d as SaveData);
  if (problem) {
    const missingMods = (d.mods ?? []).filter((m) => !ACTIVE_MODS.some((a) => a.id === m.id)).map((m) => m.name);
    throw new SaveError(missingMods.length ? `save needs mods: ${missingMods.join(', ')}` : `save ${problem}`, missingMods);
  }
  return d as SaveData;
}

/** Rebuilds a state from a setup and an action log. Throws if any action is illegal. */
export function replay(setup: GameSetup, actions: Action[]): GameState {
  let state = createGame(setup);
  actions.forEach((action, i) => {
    const res = applyAction(state, action);
    if (!res.ok) throw new SaveError(`action ${i} (${action.type}) is illegal: ${res.error}`);
    state = res.state;
  });
  return state;
}

/** True if replaying the save's log reproduces its snapshot exactly. */
export function verifySave(save: SaveData): boolean {
  try {
    return JSON.stringify(replay(save.setup, save.actions)) === JSON.stringify(save.snapshot);
  } catch {
    return false;
  }
}

/** Turns a save back into a playable match. Moves made before saving cannot be undone. */
export function restoreMatch(save: SaveData): Match {
  return {
    setup: structuredClone(save.setup),
    actions: structuredClone(save.actions),
    state: structuredClone(save.snapshot),
    history: [],
    undoFloor: save.actions.length,
  };
}

// ---------------------------------------------------------------------------
// Slots

export const SLOT_IDS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

const KEY_PREFIX = 'hero-of-arcadia.save.';

export interface SlotInfo {
  id: SlotId;
  save: SaveData | null;
  /** Set when a slot holds data that could not be read. */
  error?: string;
  /** Mods the slot's save needs that are not active. */
  missingMods?: string[];
}

export class SaveStore {
  constructor(private storage: StorageLike) {}

  write(slot: SlotId, save: SaveData): void {
    this.storage.setItem(KEY_PREFIX + slot, serializeSave(save));
  }

  read(slot: SlotId): SaveData | null {
    const raw = this.storage.getItem(KEY_PREFIX + slot);
    return raw === null ? null : parseSave(raw);
  }

  remove(slot: SlotId): void {
    this.storage.removeItem(KEY_PREFIX + slot);
  }

  list(): SlotInfo[] {
    return SLOT_IDS.map((id) => {
      try {
        return { id, save: this.read(id) };
      } catch (e) {
        const missingMods = e instanceof SaveError && e.missingMods.length ? e.missingMods : undefined;
        return { id, save: null, error: e instanceof Error ? e.message : String(e), missingMods };
      }
    });
  }
}

/** In-memory StorageLike, for tests and for browsers that block localStorage. */
export class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
