// Player preferences, persisted in localStorage. Reading and writing are wrapped so the
// game still works when storage is blocked (private windows, sandboxed iframes).

import { MemoryStorage, SaveStore, type StorageLike } from '../core/save';
import type { ZoomSetting } from './display';

export type AnimSpeed = 'normal' | 'fast' | 'instant';

export interface Settings {
  /** Sound effects volume, 0..10. */
  volume: number;
  zoom: ZoomSetting;
  animSpeed: AnimSpeed;
  /** Show a faint grid over the map. */
  grid: boolean;
  /** Ask before ending a turn while units can still act. */
  confirmEndTurn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 6,
  zoom: 'auto',
  animSpeed: 'normal',
  grid: false,
  confirmEndTurn: true,
};

const SETTINGS_KEY = 'hero-of-arcadia.settings';

function pickStorage(): StorageLike {
  try {
    const probe = '__hoa_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return new MemoryStorage();
  }
}

export const storage: StorageLike = pickStorage();
export const saves = new SaveStore(storage);

let current: Settings = load();

function load(): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // storage full or blocked: keep the setting for this session only
  }
  return current;
}

/** Walking speed (ms per tile) and effect-timing factor for an animation setting. */
export function animTimings(speed: AnimSpeed): { step: number; fx: number; aiPause: number } {
  switch (speed) {
    case 'fast':
      return { step: 35, fx: 0.5, aiPause: 90 };
    case 'instant':
      return { step: 0, fx: 0, aiPause: 0 };
    default:
      return { step: 60, fx: 1, aiPause: 150 };
  }
}
