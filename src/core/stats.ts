// Effective numbers: base data plus faction perks. Every rule that needs a unit's stats,
// a movement cost, a defense bonus, income, healing or capture strength asks this module,
// so a perk (or a mod's perk) applies everywhere at once. Results are cached per content
// version, faction and unit type.

import { BUILDINGS, contentVersion, FACTIONS, getBuildingDef, getFaction, getUnitDef, RULES, TERRAIN } from './data';
import { buildingAt, terrainAt } from './state';
import type { Coord, Effect, GameState, Unit, UnitDef, UnitFilter } from './types';

type EffectOf<T extends Effect['type']> = Extract<Effect, { type: T }>;

let cacheVersion = -1;
const caches = {
  effects: new Map<string, Effect[]>(),
  stats: new Map<string, UnitDef>(),
  moveCosts: new Map<string, Map<string, number | undefined>>(),
};

function fresh(): void {
  const v = contentVersion();
  if (v === cacheVersion) return;
  cacheVersion = v;
  caches.effects.clear();
  caches.stats.clear();
  caches.moveCosts.clear();
}

/** All effects granted by a faction's perks, in data order. */
export function factionEffects(faction: string): Effect[] {
  fresh();
  let list = caches.effects.get(faction);
  if (!list) {
    const f = FACTIONS[faction];
    list = f?.perks?.flatMap((p) => p.effects) ?? [];
    caches.effects.set(faction, list);
  }
  return list;
}

function effectsOfType<T extends Effect['type']>(faction: string, type: T): EffectOf<T>[] {
  return factionEffects(faction).filter((e): e is EffectOf<T> => e.type === type);
}

/** Whether a unit type is selected by a filter (ids or tags; an empty filter selects all). */
export function matchesFilter(filter: UnitFilter, def: UnitDef): boolean {
  const hasUnits = !!filter.units?.length;
  const hasTags = !!filter.tags?.length;
  if (!hasUnits && !hasTags) return true;
  return (hasUnits && filter.units!.includes(def.id)) || (hasTags && filter.tags!.some((t) => def.tags.includes(t)));
}

export function factionOf(state: GameState, player: number): string {
  return state.players[player].faction;
}

/** A unit type's definition with its faction's perks applied. */
export function unitStatsFor(faction: string, type: string): UnitDef {
  fresh();
  const key = `${faction}|${type}`;
  const cached = caches.stats.get(key);
  if (cached) return cached;
  const base = getUnitDef(type);
  const s: UnitDef = { ...base, range: [base.range[0], base.range[1]], tags: [...base.tags], bonusVs: { ...base.bonusVs } };
  const values: Record<string, number> = {
    attack: s.attack,
    defense: s.defense,
    move: s.move,
    vision: s.vision,
    maxHp: s.maxHp,
    rangeMin: s.range[0],
    rangeMax: s.range[1],
  };
  for (const e of effectsOfType(faction, 'unitStat')) {
    if (!matchesFilter(e, base)) continue;
    values[e.stat] = values[e.stat] * (e.mul ?? 1) + (e.add ?? 0);
  }
  s.attack = Math.max(0, Math.round(values.attack));
  s.defense = Math.round(values.defense);
  s.move = Math.max(1, Math.round(values.move));
  s.vision = Math.max(0, Math.round(values.vision));
  s.maxHp = Math.max(1, Math.round(values.maxHp));
  const rMin = Math.max(1, Math.round(values.rangeMin));
  s.range = [rMin, Math.max(rMin, Math.round(values.rangeMax))];
  let cost = s.cost;
  for (const e of effectsOfType(faction, 'unitCost')) {
    if (matchesFilter(e, base)) cost = cost * (e.mul ?? 1) + (e.add ?? 0);
  }
  s.cost = Math.max(1, Math.round(cost));
  caches.stats.set(key, s);
  return s;
}

/** Effective stats of a unit in play. */
export function statsOf(state: GameState, unit: Pick<Unit, 'owner' | 'type'>): UnitDef {
  return unitStatsFor(factionOf(state, unit.owner), unit.type);
}

/** Movement cost table (terrain or building id -> cost, undefined = impassable). */
function moveCostTable(faction: string, moveType: string): Map<string, number | undefined> {
  fresh();
  const key = `${faction}|${moveType}`;
  let table = caches.moveCosts.get(key);
  if (table) return table;
  table = new Map();
  for (const t of Object.values(TERRAIN)) table.set(t.id, t.moveCost[moveType]);
  for (const b of Object.values(BUILDINGS)) table.set(b.id, b.moveCost[moveType]);
  for (const e of effectsOfType(faction, 'moveCost')) {
    if (e.moveTypes && !e.moveTypes.includes(moveType)) continue;
    for (const id of e.terrain) {
      let cost = table.get(id);
      if (e.set !== undefined) cost = e.set === null ? undefined : e.set;
      if (e.add !== undefined && cost !== undefined) cost = Math.max(1, cost + e.add);
      table.set(id, cost);
    }
  }
  caches.moveCosts.set(key, table);
  return table;
}

/** Movement points `player`'s units of `moveType` spend to enter a tile (undefined = impassable). */
export function moveCostFor(state: GameState, player: number, moveType: string, x: number, y: number): number | undefined {
  return moveCostTable(factionOf(state, player), moveType).get(terrainAt(state, x, y).id);
}

/** Defense bonus for `unit` standing on `at`: terrain (or building) plus faction perks. */
export function defenseBonus(state: GameState, unit: Pick<Unit, 'owner' | 'type'>, at: Coord): number {
  const tile = terrainAt(state, at.x, at.y);
  let bonus = tile.defense;
  const faction = factionOf(state, unit.owner);
  const effects = effectsOfType(faction, 'terrainDefense');
  if (effects.length === 0) return bonus;
  const def = getUnitDef(unit.type);
  for (const e of effects) {
    if (e.terrain && !e.terrain.includes(tile.id)) continue;
    if (e.ownBuildings && buildingAt(state, at.x, at.y)?.owner !== unit.owner) continue;
    if (!matchesFilter(e, def)) continue;
    bonus += e.add;
  }
  return bonus;
}

/** Damage multiplier from the attacker's bonuses against the defender's type. */
export function damageMultiplier(state: GameState, attacker: Pick<Unit, 'owner' | 'type'>, defender: Pick<Unit, 'owner' | 'type'>): number {
  return damageMultiplierFor(factionOf(state, attacker.owner), attacker.type, defender.type);
}

export function damageMultiplierFor(attackerFaction: string, attackerType: string, defenderType: string): number {
  const a = getUnitDef(attackerType);
  const d = getUnitDef(defenderType);
  let mul = a.bonusVs[defenderType] ?? 1;
  for (const e of effectsOfType(attackerFaction, 'damageVs')) {
    if (matchesFilter(e, a) && matchesFilter(e.vs, d)) mul *= e.mul;
  }
  return mul;
}

/** Gold a player collects at the start of their turn. */
export function incomeOf(state: GameState, player: number): number {
  let total = 0;
  for (const b of state.buildings) if (b.owner === player) total += getBuildingDef(b.type).income;
  for (const e of effectsOfType(factionOf(state, player), 'income')) total = total * (e.mul ?? 1) + (e.add ?? 0);
  return Math.max(0, Math.round(total));
}

/** HP a unit regains at the start of its owner's turn (before capping at max HP). */
export function healAmount(state: GameState, unit: Unit): number {
  const b = buildingAt(state, unit.x, unit.y);
  const onOwn = !!b && b.owner === unit.owner;
  let amount = onOwn ? getBuildingDef(b!.type).heal : 0;
  for (const e of effectsOfType(factionOf(state, unit.owner), 'heal')) {
    amount += onOwn ? (e.buildings ?? 0) : (e.anywhere ?? 0);
  }
  return amount;
}

/** Capture points a unit adds per capture action. */
export function captureStrength(state: GameState, unit: Unit): number {
  const stats = statsOf(state, unit);
  const rule = RULES.captureStrength;
  let strength = unit.hp >= Math.ceil(stats.maxHp * rule.woundedBelow) ? rule.healthy : rule.wounded;
  const def = getUnitDef(unit.type);
  for (const e of effectsOfType(factionOf(state, unit.owner), 'captureStrength')) {
    if (matchesFilter(e, def)) strength += e.add;
  }
  return Math.max(1, strength);
}

/** The unit type a faction fields in place of `type` (roster replacements). */
export function rosterType(faction: string, type: string): string {
  return FACTIONS[faction]?.roster?.replace?.[type] ?? type;
}

/** Unit types a faction can raise at a building type. */
export function rosterForFaction(faction: string, buildingType: string): string[] {
  const produces = getBuildingDef(buildingType).produces;
  if (produces.length === 0) return [];
  const roster = getFaction(faction).roster;
  const out: string[] = [];
  for (const t of produces) {
    const r = rosterType(faction, t);
    if (!out.includes(r)) out.push(r);
  }
  for (const t of roster?.add ?? []) if (!out.includes(t)) out.push(t);
  return out.filter((t) => !roster?.remove?.includes(t));
}

export function rosterFor(state: GameState, player: number, buildingType: string): string[] {
  return rosterForFaction(factionOf(state, player), buildingType);
}
