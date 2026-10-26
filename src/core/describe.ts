// Human-readable text for perks and effects, generated from data so faction screens stay
// accurate when numbers change or mods add new perks.

import { MOVE_TYPES, TERRAIN, BUILDINGS, UNITS } from './data';
import type { Effect, FactionDef, PerkDef, UnitFilter } from './types';

const STAT_NAMES: Record<string, string> = {
  attack: 'attack',
  defense: 'defense',
  move: 'move',
  vision: 'vision',
  maxHp: 'max HP',
  rangeMin: 'minimum range',
  rangeMax: 'range',
};

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(name: string): string {
  if (name.endsWith('man')) return `${name.slice(0, -3)}men`;
  return name.endsWith('s') ? name : `${name}s`;
}

function who(f: UnitFilter): string {
  const parts: string[] = [];
  for (const u of f.units ?? []) parts.push(plural(UNITS[u]?.name ?? u));
  for (const t of f.tags ?? []) parts.push(t);
  return parts.length ? list(parts) : 'all units';
}

function places(ids: string[]): string {
  return list(ids.map((id) => TERRAIN[id]?.name ?? BUILDINGS[id]?.name ?? id).map((n) => n.toLowerCase()));
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function percent(mul: number): string {
  const p = Math.round((mul - 1) * 100);
  return `${p >= 0 ? '+' : ''}${p}%`;
}

function change(add?: number, mul?: number, what = ''): string {
  const bits: string[] = [];
  if (mul !== undefined && mul !== 1) bits.push(`${percent(mul)}${what}`);
  if (add !== undefined && add !== 0) bits.push(`${signed(add)}${what}`);
  return bits.join(' and ') || 'no change';
}

export function describeEffect(e: Effect): string {
  switch (e.type) {
    case 'unitStat':
      return `${change(e.add, e.mul, ` ${STAT_NAMES[e.stat] ?? e.stat}`)} for ${who(e)}`;
    case 'unitCost': {
      const bits: string[] = [];
      if (e.mul !== undefined && e.mul !== 1) bits.push(`${Math.abs(Math.round((e.mul - 1) * 100))}% ${e.mul < 1 ? 'less' : 'more'}`);
      if (e.add) bits.push(`${Math.abs(e.add)} ${e.add < 0 ? 'less' : 'more'}`);
      return `${who(e)} cost ${bits.join(' and ') || 'the same'}`;
    }
    case 'moveCost': {
      const movers = e.moveTypes?.length ? `${list(e.moveTypes.map((m) => (MOVE_TYPES[m]?.name ?? m).toLowerCase()))} units` : 'all units';
      if (e.set === null) return `${movers} cannot enter ${places(e.terrain)}`;
      if (e.set !== undefined) return `${places(e.terrain)} cost${e.terrain.length > 1 ? '' : 's'} ${e.set} move for ${movers}`;
      return `${places(e.terrain)} cost ${signed(e.add ?? 0)} move for ${movers}`;
    }
    case 'terrainDefense': {
      const where = e.ownBuildings ? 'on your own buildings' : e.terrain ? `on ${places(e.terrain)}` : 'everywhere';
      return `${signed(e.add)} defense ${where} for ${who(e)}`;
    }
    case 'income':
      return `${change(e.add, e.mul)} income`;
    case 'heal': {
      const bits: string[] = [];
      if (e.anywhere) bits.push(`heal ${e.anywhere} HP per turn anywhere`);
      if (e.buildings) bits.push(`${e.buildings} more on buildings`);
      return `units ${bits.join(', ')}`;
    }
    case 'captureStrength':
      return `${signed(e.add)} capture strength for ${who(e)}`;
    case 'damageVs':
      return `${percent(e.mul)} damage by ${who(e)} against ${who(e.vs)}`;
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The perk's own description, or one generated from its effects. */
export function describePerk(p: PerkDef): string {
  return p.desc ?? `${p.effects.map((e) => capitalise(describeEffect(e))).join('. ')}.`;
}

/** Short lines summarising a faction: perks and unique units. */
export function describeFaction(f: FactionDef): string[] {
  const lines = (f.perks ?? []).map((p) => `${p.name}: ${describePerk(p)}`);
  for (const [from, to] of Object.entries(f.roster?.replace ?? {})) {
    lines.push(`${UNITS[to]?.name ?? to} replaces the ${UNITS[from]?.name ?? from}.`);
  }
  for (const u of f.roster?.add ?? []) lines.push(`Can also raise ${plural(UNITS[u]?.name ?? u)}.`);
  for (const u of f.roster?.remove ?? []) lines.push(`Cannot raise ${plural(UNITS[u]?.name ?? u)}.`);
  return lines;
}
