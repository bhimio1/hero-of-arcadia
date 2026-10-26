// Combat math. Damage is deterministic unless the game's "luck" option is on, in which
// case each strike may deal up to LUCK_MAX extra damage drawn from the seeded RNG.

import { getUnitDef } from './data';
import { terrainAt } from './state';
import { manhattan, tilesInRange, toIndex } from './grid';
import type { Coord, GameState, Unit } from './types';

export const LUCK_MAX = 1;

/** Defense bonus from the tile a unit stands on. */
export function terrainDefense(state: GameState, at: Coord): number {
  return terrainAt(state, at.x, at.y).defense;
}

/**
 * Base damage of `attacker` (with `attackerHp`) hitting `defender` where it stands.
 *   damage = round(attack * bonusVs * hp/maxHp * (1 - 0.1 * (defense + terrainDefense)))
 */
export function baseDamage(state: GameState, attacker: Unit, attackerHp: number, defender: Unit): number {
  const a = getUnitDef(attacker.type);
  const d = getUnitDef(defender.type);
  const bonus = a.bonusVs[defender.type] ?? 1;
  const defense = d.defense + terrainDefense(state, defender);
  const factor = Math.max(0, 1 - 0.1 * defense);
  const raw = a.attack * bonus * (Math.max(0, attackerHp) / a.maxHp) * factor;
  return Math.max(0, Math.round(raw + 1e-9));
}

/** Damage a full-health `attacker` type deals to a `defender` type on open ground. */
export function rawDamage(attackerType: string, defenderType: string): number {
  const a = getUnitDef(attackerType);
  const d = getUnitDef(defenderType);
  return a.attack * (a.bonusVs[defenderType] ?? 1) * Math.max(0, 1 - 0.1 * d.defense);
}

export function inAttackRange(unit: Unit, from: Coord, target: Coord): boolean {
  const [min, max] = getUnitDef(unit.type).range;
  const d = manhattan(from, target);
  return d >= min && d <= max;
}

/** Whether `defender` strikes back when hit from `attackerPos` (assuming it survives). */
export function canCounter(defender: Unit, attackerPos: Coord): boolean {
  const def = getUnitDef(defender.type);
  return def.counter && inAttackRange(defender, defender, attackerPos);
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
  const luck = state.options.luck ? LUCK_MAX : 0;
  const placed = { ...attacker, x: from.x, y: from.y };
  const dmg = baseDamage(state, placed, attacker.hp, defender);
  const dmgMax = dmg + luck;
  const defHpMin = Math.max(0, defender.hp - dmgMax);
  const defHpMax = Math.max(0, defender.hp - dmg);
  let counter: [number, number] | null = null;
  if (defHpMax > 0 && canCounter(defender, from)) {
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
  return state.units.filter((u) => u.owner !== unit.owner && isVisible(u) && inAttackRange(unit, from, u));
}

/**
 * Tiles `unit` could strike this turn: from any of `origins` if it can move and fire,
 * otherwise only from where it stands.
 */
export function threatTiles(state: GameState, unit: Unit, origins: Coord[]): Coord[] {
  const def = getUnitDef(unit.type);
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
