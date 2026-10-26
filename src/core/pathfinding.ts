import { DIRECTIONS, fromIndex, inBounds, toIndex } from './grid';
import { moveCostFor, statsOf } from './stats';
import type { Coord, GameState, MoveType, Unit } from './types';

/** Min-heap keyed by (priority, insertion order) so ties resolve deterministically. */
class MinHeap {
  private items: { p: number; seq: number; v: number }[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(p: number, v: number): void {
    const items = this.items;
    items.push({ p, seq: this.seq++, v });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  pop(): { p: number; v: number } {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(l, m)) m = l;
        if (r < items.length && this.less(r, m)) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.p < y.p || (x.p === y.p && x.seq < y.seq);
  }
}

export interface Reach {
  width: number;
  origin: Coord;
  /** Movement points spent to reach each tile index. */
  cost: Map<number, number>;
  /** Previous tile index on the cheapest path. */
  prev: Map<number, number>;
}

export interface ReachOptions {
  /** Movement budget; defaults to the unit's move stat. */
  budget?: number;
  /** Treat enemy units as passable (used for planning, never for real moves). */
  ignoreEnemies?: boolean;
}

/**
 * Dijkstra flood fill from a unit's position. Enemy units block movement;
 * friendly units can be passed through (but not stopped on, see `destinations`).
 */
export function computeReach(state: GameState, unit: Unit, opts: ReachOptions = {}): Reach {
  const def = statsOf(state, unit);
  const budget = opts.budget ?? def.move;
  const { width, height } = state;
  const blocked = new Set<number>();
  if (!opts.ignoreEnemies) {
    for (const u of state.units) {
      if (u.owner !== unit.owner) blocked.add(toIndex(width, u.x, u.y));
    }
  }
  const start = toIndex(width, unit.x, unit.y);
  const cost = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  heap.push(0, start);
  while (heap.size > 0) {
    const { p, v } = heap.pop();
    if (p > (cost.get(v) ?? Infinity)) continue;
    const c = fromIndex(width, v);
    for (const d of DIRECTIONS) {
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      if (!inBounds(width, height, nx, ny)) continue;
      const ni = toIndex(width, nx, ny);
      if (blocked.has(ni)) continue;
      const step = moveCostFor(state, unit.owner, def.moveType, nx, ny);
      if (step === undefined) continue;
      const total = p + step;
      if (total > budget) continue;
      if (total < (cost.get(ni) ?? Infinity)) {
        cost.set(ni, total);
        prev.set(ni, v);
        heap.push(total, ni);
      }
    }
  }
  return { width, origin: { x: unit.x, y: unit.y }, cost, prev };
}

/** Tiles the unit may end its move on: reachable and not occupied by another unit. */
export function destinations(state: GameState, unit: Unit, reach = computeReach(state, unit)): Coord[] {
  const occupied = new Set(state.units.filter((u) => u.id !== unit.id).map((u) => toIndex(state.width, u.x, u.y)));
  const out: Coord[] = [];
  for (const idx of reach.cost.keys()) {
    if (!occupied.has(idx)) out.push(fromIndex(state.width, idx));
  }
  return out;
}

/** Reconstructs the cheapest path (including the start tile) to `target`, or null if unreachable. */
export function pathTo(reach: Reach, target: Coord): Coord[] | null {
  let idx = toIndex(reach.width, target.x, target.y);
  if (!reach.cost.has(idx)) return null;
  const path: Coord[] = [];
  for (;;) {
    path.push(fromIndex(reach.width, idx));
    const p = reach.prev.get(idx);
    if (p === undefined) break;
    idx = p;
  }
  return path.reverse();
}

/**
 * Movement cost for `player`'s units of `moveType` to follow `path` (first element =
 * current position), or null if the path is malformed or crosses impassable terrain.
 * Does not look at units.
 */
export function pathCost(state: GameState, player: number, moveType: MoveType, path: Coord[]): number | null {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return null;
    if (!inBounds(state.width, state.height, b.x, b.y)) return null;
    const step = moveCostFor(state, player, moveType, b.x, b.y);
    if (step === undefined) return null;
    total += step;
  }
  return total;
}

/**
 * Multi-source distance field: for every tile, the movement cost for `player`'s units of
 * `moveType` to reach the nearest goal tile. Unreachable tiles are Infinity. Units are ignored.
 */
export function distanceField(state: GameState, player: number, moveType: MoveType, goals: Coord[]): number[] {
  const { width, height } = state;
  const dist = new Array<number>(width * height).fill(Infinity);
  const heap = new MinHeap();
  for (const g of goals) {
    const gi = toIndex(width, g.x, g.y);
    if (dist[gi] !== 0) {
      dist[gi] = 0;
      heap.push(0, gi);
    }
  }
  while (heap.size > 0) {
    const { p, v } = heap.pop();
    if (p > dist[v]) continue;
    const c = fromIndex(width, v);
    // Walking from a neighbour into `v` costs the price of entering `v`.
    const enter = moveCostFor(state, player, moveType, c.x, c.y);
    const stepCost = enter ?? 1;
    for (const d of DIRECTIONS) {
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      if (!inBounds(width, height, nx, ny)) continue;
      if (moveCostFor(state, player, moveType, nx, ny) === undefined) continue;
      const ni = toIndex(width, nx, ny);
      const total = p + stepCost;
      if (total < dist[ni]) {
        dist[ni] = total;
        heap.push(total, ni);
      }
    }
  }
  return dist;
}
