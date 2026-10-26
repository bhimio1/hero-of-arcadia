// A simple greedy AI. Every time it is asked, it scores every option of every unit that
// can still act and returns the first step of the best one:
//   attack  = value of damage dealt (+ kill bonus) - value of damage taken in the counter
//   move    = progress toward a tile from which it can attack, terrain defense, and a
//             penalty for ending where enemies can hit it next turn
// It sees only the `view` it is given, so it cannot cheat through fog of war.

import { baseDamage, previewAttack, rawDamage, targetsFrom, terrainDefense, threatTiles } from '../combat';
import { getBuildingDef, getUnitDef } from '../data';
import { captureStrength } from '../rules';
import { tilesInRange, toIndex } from '../grid';
import { computeReach, destinations, distanceField, pathTo } from '../pathfinding';
import { buildingAt, moveCostAt, unitAt } from '../state';
import type { Action, Building, Coord, GameState, Unit } from '../types';
import type { AiController } from './types';

const PROGRESS_WEIGHT = 6;
const TERRAIN_WEIGHT = 2;
const ATTACK_BIAS = 5;
const BUILDING_VALUE: Record<string, number> = { keep: 600, barracks: 260, village: 160 };

interface Plan {
  unit: Unit;
  path: Coord[] | null;
  action: Action;
  score: number;
}

const avg = (r: [number, number]) => (r[0] + r[1]) / 2;

/** Per-call cache of things every unit's evaluation needs. */
class Context {
  readonly enemies: Unit[];
  private threatBy = new Map<number, Unit[]>();
  private fields = new Map<string, number[]>();

  constructor(
    readonly view: GameState,
    readonly me: number,
  ) {
    this.enemies = view.units.filter((u) => u.owner !== me);
    for (const e of this.enemies) {
      const reach = computeReach(view, e);
      for (const t of threatTiles(view, e, destinations(view, e, reach))) {
        const i = toIndex(view.width, t.x, t.y);
        const list = this.threatBy.get(i);
        if (list) list.push(e);
        else this.threatBy.set(i, [e]);
      }
    }
  }

  /** Total damage enemies could deal to `unit` if it stood on `at` next turn. */
  threatAt(unit: Unit, at: Coord): number {
    const list = this.threatBy.get(toIndex(this.view.width, at.x, at.y));
    if (!list) return 0;
    const placed = { ...unit, x: at.x, y: at.y };
    let total = 0;
    for (const e of list) total += baseDamage(this.view, e, e.hp, placed);
    return total;
  }

  /** Distance field (in movement points) toward tiles from which `unit` could attack an enemy. */
  goalField(unit: Unit): number[] {
    const def = getUnitDef(unit.type);
    const key = unit.type;
    const cached = this.fields.get(key);
    if (cached) return cached;
    const goals: Coord[] = [];
    for (const e of this.enemies) {
      for (const t of tilesInRange(this.view.width, this.view.height, e, def.range[0], def.range[1])) {
        if (moveCostAt(this.view, def.moveType, t.x, t.y) !== undefined) goals.push(t);
      }
    }
    if (def.canCapture) {
      for (const b of this.view.buildings) if (b.owner !== this.me) goals.push({ x: b.x, y: b.y });
    }
    if (goals.length === 0) {
      // nothing in sight: head for enemy buildings, or the middle of the map
      for (const b of this.view.buildings) if (b.owner !== null && b.owner !== this.me) goals.push({ x: b.x, y: b.y });
      if (goals.length === 0) goals.push({ x: Math.floor(this.view.width / 2), y: Math.floor(this.view.height / 2) });
    }
    const field = distanceField(this.view, def.moveType, goals);
    this.fields.set(key, field);
    return field;
  }
}

export interface GreedyAiOptions {
  /** How strongly units avoid ending their move under threat (0 = reckless). */
  caution?: number;
}

export class GreedyAi implements AiController {
  readonly name = 'greedy';
  private caution: number;

  constructor(opts: GreedyAiOptions = {}) {
    this.caution = opts.caution ?? 1;
  }

  nextAction(view: GameState): Action {
    if (view.gameOver) return { type: 'endTurn' };
    const me = view.currentPlayer;
    const ready = view.units.filter((u) => u.owner === me && !u.acted);
    if (ready.length === 0) return this.chooseBuild(view) ?? { type: 'endTurn' };
    const ctx = new Context(view, me);
    let best: Plan | null = null;
    for (const unit of ready) {
      const plan = this.planUnit(ctx, unit);
      if (!best || plan.score > best.score + 1e-9) best = plan;
    }
    if (!best) return { type: 'endTurn' };
    if (best.path && best.path.length > 1) return { type: 'move', unitId: best.unit.id, path: best.path };
    return best.action;
  }

  private planUnit(ctx: Context, unit: Unit): Plan {
    const view = ctx.view;
    const def = getUnitDef(unit.type);
    const here = { x: unit.x, y: unit.y };
    const reach = unit.moved ? null : computeReach(view, unit);
    const dests = reach ? destinations(view, unit, reach) : [here];
    const field = ctx.goalField(unit);
    const distHere = field[toIndex(view.width, here.x, here.y)];
    let best: Plan = { unit, path: null, action: { type: 'wait', unitId: unit.id }, score: -Infinity };
    const consider = (p: Plan) => {
      if (p.score > best.score + 1e-9) best = p;
    };
    for (const d of dests) {
      const moving = d.x !== here.x || d.y !== here.y;
      const path = moving && reach ? pathTo(reach, d) : null;
      if (moving && !path) continue;
      const pos = this.positionScore(ctx, unit, d, field, distHere);
      consider({ unit, path, action: { type: 'wait', unitId: unit.id }, score: pos });
      if (def.canCapture) {
        const b = buildingAt(view, d.x, d.y);
        if (b && b.owner !== unit.owner) {
          consider({ unit, path, action: { type: 'capture', unitId: unit.id }, score: pos + this.captureScore(unit, b) });
        }
      }
      const canFire = def.moveAndFire || (!unit.moved && !moving);
      if (!canFire) continue;
      for (const target of targetsFrom(view, unit, d)) {
        const score = pos + this.attackScore(view, unit, target, d);
        consider({ unit, path, action: { type: 'attack', unitId: unit.id, targetId: target.id }, score });
      }
    }
    return best;
  }

  private captureScore(unit: Unit, b: Building): number {
    const def = getBuildingDef(b.type);
    let value = BUILDING_VALUE[b.type] ?? 150;
    if (b.owner !== null) value *= 1.25; // taking it also cuts the enemy's income
    const progress = b.capture?.unitId === unit.id ? b.capture.points : 0;
    if (progress > 0) value += 120; // never abandon a half-finished capture lightly
    if (progress + captureStrength(unit) >= def.capturePoints) value += 100;
    return value * 0.5;
  }

  /** Picks a unit to raise at the first free production building, if any is worth it. */
  private chooseBuild(view: GameState): Action | null {
    const me = view.currentPlayer;
    const gold = view.players[me].gold;
    const enemies = view.units.filter((u) => u.owner !== me);
    const mine = view.units.filter((u) => u.owner === me);
    const capturable = view.buildings.filter((b) => b.owner !== me).length;
    for (const b of view.buildings) {
      if (b.owner !== me || unitAt(view, b.x, b.y)) continue;
      const options = getBuildingDef(b.type).produces.filter((t) => getUnitDef(t).cost <= gold);
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const t of options) {
        const score = this.buildScore(t, enemies, mine, capturable, gold);
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (best) return { type: 'build', buildingId: b.id, unitType: best };
    }
    return null;
  }

  /** How useful a new unit of `type` would be against the enemies in sight, per gold spent. */
  private buildScore(type: string, enemies: Unit[], mine: Unit[], capturable: number, gold: number): number {
    const def = getUnitDef(type);
    let score = 0;
    for (const e of enemies) {
      const ed = getUnitDef(e.type);
      const dealt = rawDamage(type, e.type) * (ed.cost / ed.maxHp);
      // ranged units take no counter from melee targets
      const countered = ed.counter && ed.range[0] <= def.range[0];
      const taken = (countered ? rawDamage(e.type, type) : 0) * (def.cost / def.maxHp);
      score += dealt - 0.5 * taken;
    }
    score = (score / Math.max(1, enemies.length) / def.cost) * 10;
    // with a full treasury, prefer stronger (pricier) troops over cheap ones
    const richness = Math.min(1, gold / 1200);
    score += (def.cost / 100) * richness * 1.5;
    const capturers = mine.filter((u) => getUnitDef(u.type).canCapture).length;
    if (def.canCapture && capturable > 0 && capturers < 3) score += 3;
    score -= mine.filter((u) => u.type === type).length * 0.4;
    return score;
  }

  private attackScore(view: GameState, unit: Unit, target: Unit, from: Coord): number {
    const p = previewAttack(view, unit, target, from);
    const me = getUnitDef(unit.type);
    const them = getUnitDef(target.type);
    let value = (Math.min(target.hp, avg(p.damage)) * them.cost) / them.maxHp;
    if (p.defenderHpAfter[1] === 0) value += them.cost * 0.5;
    else if (p.defenderHpAfter[0] === 0) value += them.cost * 0.25;
    if (p.counter) {
      value -= (Math.min(unit.hp, avg(p.counter)) * me.cost) / me.maxHp;
      if (p.attackerHpAfter[1] === 0) value -= me.cost * 0.5;
    }
    return value + ATTACK_BIAS;
  }

  private positionScore(ctx: Context, unit: Unit, at: Coord, field: number[], distHere: number): number {
    const view = ctx.view;
    const def = getUnitDef(unit.type);
    const dist = field[toIndex(view.width, at.x, at.y)];
    let score = 0;
    const b = buildingAt(view, at.x, at.y);
    if (b && b.owner === unit.owner && getBuildingDef(b.type).produces.length > 0) score -= 15; // keep the yard clear
    if (b && b.owner !== unit.owner && !def.canCapture) score -= 20; // leave it for a unit that can take it
    if (Number.isFinite(distHere) && Number.isFinite(dist)) score += (distHere - dist) * PROGRESS_WEIGHT;
    else if (Number.isFinite(dist)) score += PROGRESS_WEIGHT;
    const threat = Math.min(unit.hp, ctx.threatAt(unit, at));
    if (threat > 0) {
      // cover only matters where the unit can actually be hit
      score += terrainDefense(view, at) * TERRAIN_WEIGHT;
      // fragile ranged units hang back; melee units accept a scratch to close in
      const ranged = def.range[1] > 1;
      const base = ranged ? 0.8 : 0.25;
      // grow bolder as the battle drags on so games do not stall
      const boldness = Math.max(0, 1 - 0.03 * (view.round - 1));
      const risk = base * boldness * this.caution;
      score -= ((threat * def.cost) / def.maxHp) * risk;
      if (threat >= unit.hp) score -= def.cost * 0.25 * boldness * this.caution;
    }
    return score;
  }
}
