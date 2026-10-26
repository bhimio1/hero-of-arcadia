// Combat math. Damage is deterministic unless the game's "luck" option is on, in which
// case each strike may deal up to rules.luckMax extra damage drawn from the seeded RNG.
// All numbers are effective ones: base data plus the owners' faction perks.

import { RULES } from './data';
import { manhattan, tilesInRange, toIndex } from './grid';
import { damageMultiplier, damageMultiplierFor, defenseBonus, statsOf, unitStatsFor } from './stats';
import type { Coord, GameState, Unit } from './types';

/** Extra damage a strike may roll when luck is on. */
export function luckMax(): number {
  return RULES.luckMax;
}

/**
 * Base damage of `attacker` (with `attackerHp`) hitting `defender` where it stands.
 *   damage = round(attack * bonus * hp/maxHp * (1 - defensePerPoint * (defense + terrain)))
 */
export function baseDamage(state: GameState, attacker: Unit, attackerHp: number, defender: Unit): number {
  const a = statsOf(state, attacker);
  const d = statsOf(state, defender);
  const bonus = damageMultiplier(state, attacker, defender);
  const defense = d.defense + defenseBonus(state, defender, defender);
  const factor = Math.max(0, 1 - RULES.defensePerPoint * defense);
  const raw = a.attack * bonus * (Math.max(0, attackerHp) / a.maxHp) * factor;
  return Math.max(0, Math.round(raw + 1e-9));
}

/** Damage a full-health unit type deals to another on open ground (used for AI planning). */
export function rawDamage(attackerType: string, defenderType: string, attackerFaction: string, defenderFaction: string): number {
  const a = unitStatsFor(attackerFaction, attackerType);
  const d = unitStatsFor(defenderFaction, defenderType);
  const bonus = damageMultiplierFor(attackerFaction, attackerType, defenderType);
  return a.attack * bonus * Math.max(0, 1 - RULES.defensePerPoint * d.defense);
}

export function inAttackRange(state: GameState, unit: Unit, from: Coord, target: Coord): boolean {
  const [min, max] = statsOf(state, unit).range;
  const d = manhattan(from, target);
  return d >= min && d <= max;
}

/** Whether `defender` strikes back when hit from `attackerPos` (assuming it survives). */
export function canCounter(state: GameState, defender: Unit, attackerPos: Coord): boolean {
  return statsOf(state, defender).counter && inAttackRange(state, defender, defender, attackerPos);
}

export interface CombatPreview {
  /** [min, max] damage dealt to the defender. */
  damage: [number, number];
  /** [min, max] counter damage dealt to the attacker, or null if there is no counter. */
  counter: [number, number] | null;
  defenderHpAfter: [number, number];
  attackerHpAfter: [number, number];
}

/** Predicts an attack from `from` (defaults to the attacker's tile) without changing state. */
export function previewAttack(state: GameState, attacker: Unit, defender: Unit, from: Coord = attacker): CombatPreview {
  const luck = state.options.luck ? luckMax() : 0;
  const placed = { ...attacker, x: from.x, y: from.y };
  const dmg = baseDamage(state, placed, attacker.hp, defender);
  const dmgMax = dmg + luck;
  const defHpMin = Math.max(0, defender.hp - dmgMax);
  const defHpMax = Math.max(0, defender.hp - dmg);
  let counter: [number, number] | null = null;
  if (defHpMax > 0 && canCounter(state, defender, from)) {
    // lowest counter comes from the weakest surviving defender, highest from the strongest
    const lowHp = defHpMin > 0 ? defHpMin : 1;
    const lo = baseDamage(state, defender, lowHp, placed);
    const hi = baseDamage(state, defender, defHpMax, placed) + luck;
    counter = [defHpMin > 0 ? lo : 0, hi];
  }
  return {
    damage: [dmg, dmgMax],
    counter,
    defenderHpAfter: [defHpMin, defHpMax],
    attackerHpAfter: counter ? [Math.max(0, attacker.hp - counter[1]), Math.max(0, attacker.hp - counter[0])] : [attacker.hp, attacker.hp],
  };
}

/** Enemy units `unit` could attack from `from` this turn. */
export function targetsFrom(state: GameState, unit: Unit, from: Coord, isVisible: (u: Unit) => boolean = () => true): Unit[] {
  return state.units.filter((u) => u.owner !== unit.owner && isVisible(u) && inAttackRange(state, unit, from, u));
}

/**
 * Tiles `unit` could strike this turn: from any of `origins` if it can move and fire,
 * otherwise only from where it stands.
 */
export function threatTiles(state: GameState, unit: Unit, origins: Coord[]): Coord[] {
  const def = statsOf(state, unit);
  const from = def.moveAndFire ? origins : [{ x: unit.x, y: unit.y }];
  const seen = new Set<number>();
  const out: Coord[] = [];
  for (const o of from) {
    for (const t of tilesInRange(state.width, state.height, o, def.range[0], def.range[1])) {
      const i = toIndex(state.width, t.x, t.y);
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(t);
    }
  }
  return out;
}
