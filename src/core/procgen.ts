// Procedural maps. Everything is driven by a seed and a biome from biomes.json, so the
// same options always give the same map. Maps are symmetric (half-turn rotation for two
// armies, quarter-turn for four) so every army gets the same ground, and roads guarantee
// that every keep can reach every other one, whatever the noise produced.
//
// Steps: noise -> terrain (biome layers) -> rivers -> cleared start areas -> roads with
// bridges and mountain passes -> fords -> buildings -> starting armies.

import { BIOMES, FACTIONS, getBiome, RULES, TERRAIN, UNITS } from './data';
import { DIRECTIONS } from './grid';
import { hashSeed, Rng } from './rng';
import type { BiomeDef, Coord, MapBuildingPlacement, MapDef, MapUnitPlacement } from './types';

export type MapSize = 'small' | 'medium' | 'large';
export type BuildingDensity = 'few' | 'normal' | 'many';

export interface GenOptions {
  seed: number;
  size: MapSize;
  players: 2 | 4;
  biome: string;
  buildings: BuildingDensity;
  /** Factions for each army (defaults to the first factions in the content). */
  factions?: string[];
}

export const MAP_SIZES: Record<2 | 4, Record<MapSize, [number, number]>> = {
  2: { small: [22, 14], medium: [28, 18], large: [36, 22] },
  4: { small: [20, 20], medium: [26, 26], large: [32, 32] },
};

const VILLAGES_PER_ARMY: Record<BuildingDensity, number> = { few: 2, normal: 4, many: 6 };

/** Small helper around a grid of terrain ids with the map's symmetry. */
class Grid {
  readonly t: string[];
  constructor(
    readonly w: number,
    readonly h: number,
    readonly turns: 2 | 4,
    fill: string,
  ) {
    this.t = new Array(w * h).fill(fill);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): string {
    return this.t[y * this.w + x];
  }

  set(x: number, y: number, id: string): void {
    this.t[y * this.w + x] = id;
  }

  /** One symmetry step: half turn for two armies, quarter turn (square maps) for four. */
  rotate(c: Coord): Coord {
    return this.turns === 2 ? { x: this.w - 1 - c.x, y: this.h - 1 - c.y } : { x: this.w - 1 - c.y, y: c.x };
  }

  /** The tile and all its images under the symmetry (deduplicated). */
  orbit(c: Coord): Coord[] {
    const out: Coord[] = [c];
    let p = c;
    for (let i = 1; i < this.turns; i++) {
      p = this.rotate(p);
      if (!out.some((q) => q.x === p.x && q.y === p.y)) out.push(p);
    }
    return out;
  }

  /** Sets a tile and all its symmetric images. */
  setSym(c: Coord, id: string): void {
    for (const p of this.orbit(c)) this.set(p.x, p.y, id);
  }
}

/** Seeded value noise in [0, 1): smoothed random lattice, three octaves. */
function noiseField(rng: Rng, w: number, h: number, scale: number): number[] {
  const out = new Array<number>(w * h).fill(0);
  const octaves: [number, number][] = [
    [scale, 0.6],
    [Math.max(2, scale / 2), 0.3],
    [Math.max(1.5, scale / 4), 0.1],
  ];
  for (const [cell, weight] of octaves) {
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const lattice = Array.from({ length: gw * gh }, () => rng.float());
    const smooth = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fx = x / cell;
        const fy = y / cell;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const v = (i: number, j: number) => lattice[(y0 + j) * gw + (x0 + i)];
        const top = v(0, 0) * (1 - tx) + v(1, 0) * tx;
        const bottom = v(0, 1) * (1 - tx) + v(1, 1) * tx;
        out[y * w + x] += weight * (top * (1 - ty) + bottom * ty);
      }
    }
  }
  return out;
}

function inRange(v: number, r?: [number, number]): boolean {
  return !r || (v >= r[0] && v < r[1]);
}

const NAME_START = ['Ash', 'Bright', 'Cold', 'Dun', 'Elder', 'Fair', 'Grey', 'High', 'Iron', 'Long', 'Mist', 'Oak', 'Red', 'Stone', 'Thorn', 'Wolf'];
const NAME_END = ['ford', 'vale', 'march', 'reach', 'fields', 'moor', 'hollow', 'crossing', 'downs', 'mere', 'heath', 'wold'];

/** A short place name for a generated map, chosen from the seed. */
export function mapName(seed: number): string {
  const rng = new Rng(hashSeed(`name:${seed}`));
  return `${rng.pick(NAME_START)}${rng.pick(NAME_END)}`;
}

/** Stable id for the map these options produce (used for thumbnails and saves). */
export function generatedMapId(o: GenOptions): string {
  return `gen-${o.biome}-${o.size}-${o.players}p-${o.buildings}-${o.seed}`;
}

export function generateMap(o: GenOptions): MapDef {
  const biome: BiomeDef = getBiome(o.biome);
  const roles = {
    clear: biome.roles?.clear ?? 'plains',
    road: biome.roles?.road ?? 'road',
    bridge: biome.roles?.bridge ?? 'bridge',
    river: biome.roles?.river ?? 'water',
    ford: biome.roles?.ford ?? 'ford',
  };
  const [w, h] = MAP_SIZES[o.players][o.size];
  const rng = new Rng(hashSeed(generatedMapId(o)));
  const g = new Grid(w, h, o.players, roles.clear);
  const scale = biome.scale ?? 6;

  // 1. Terrain from noise, sampled at each tile's symmetry representative.
  const elevation = noiseField(rng, w, h, scale);
  const moisture = noiseField(rng, w, h, scale);
  const seen = new Set<number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen.has(y * w + x)) continue;
      const orbit = g.orbit({ x, y });
      for (const p of orbit) seen.add(p.y * w + p.x);
      const e = elevation[y * w + x];
      const m = moisture[y * w + x];
      const layer = biome.layers.find((l) => inRange(e, l.elevation) && inRange(m, l.moisture)) ?? biome.layers[biome.layers.length - 1];
      g.setSym({ x, y }, layer.terrain);
    }
  }

  // 2. Rivers: half a river from an edge to the centre; symmetry draws the rest.
  const centre = { x: Math.floor((w - 1) / 2), y: Math.floor((h - 1) / 2) };
  const riverTiles: Coord[] = [];
  for (let r = 0; r < biome.rivers; r++) {
    let p: Coord = r === 0 ? { x: rng.int(Math.floor(w / 3), Math.floor((2 * w) / 3)), y: 0 } : { x: 0, y: rng.int(Math.floor(h / 3), Math.floor((2 * h) / 3)) };
    for (let steps = 0; steps < w + h; steps++) {
      g.setSym(p, roles.river);
      riverTiles.push(p);
      if (Math.abs(p.x - centre.x) + Math.abs(p.y - centre.y) <= 1) break;
      const dx = Math.sign(centre.x - p.x);
      const dy = Math.sign(centre.y - p.y);
      const towardX = Math.abs(centre.x - p.x) > Math.abs(centre.y - p.y);
      if (rng.float() < 0.7) p = towardX ? { x: p.x + dx, y: p.y } : { x: p.x, y: p.y + dy };
      else p = towardX ? { x: p.x, y: Math.max(0, Math.min(h - 1, p.y + (rng.float() < 0.5 ? -1 : 1))) } : { x: Math.max(0, Math.min(w - 1, p.x + (rng.float() < 0.5 ? -1 : 1))), y: p.y };
    }
  }

  // 3. Start areas: keep in army 0's corner, cleared ground around it.
  const keep0: Coord = { x: 2, y: h - 3 };
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const c = { x: keep0.x + dx, y: keep0.y + dy };
      if (Math.abs(dx) + Math.abs(dy) <= 3 && g.inside(c.x, c.y)) g.setSym(c, roles.clear);
    }
  }

  // 4. Roads from army 0's keep to the centre (cheapest route), mirrored for everyone.
  const roadCost = (id: string): number => {
    if (id === roles.road || id === roles.bridge) return 1;
    if (id === roles.river || TERRAIN[id]?.autotile === 'water') return 6;
    const foot = TERRAIN[id]?.moveCost.foot;
    if (foot === undefined) return 8;
    return foot + (TERRAIN[id].defense > 2 ? 3 : 0);
  };
  // Roads cut through anything (forest, hills, even mountain passes); water gets a bridge.
  // On even-sized maps the centre tile and its rotated image differ, so a short connector
  // joins them; symmetry then links every army's road into one network.
  const network = [...cheapestPath(g, keep0, centre, roadCost), ...cheapestPath(g, centre, g.rotate(centre), roadCost)];
  for (const c of network) {
    const id = g.get(c.x, c.y);
    const wet = id === roles.river || id === roles.ford || TERRAIN[id]?.autotile === 'water';
    g.setSym(c, wet ? roles.bridge : roles.road);
  }

  // 5. A couple of fords on each river half, away from the bridges.
  const fordable = riverTiles.filter((c) => g.get(c.x, c.y) === roles.river && Math.abs(c.x - centre.x) + Math.abs(c.y - centre.y) > 3);
  for (let i = 0; i < Math.min(2, fordable.length); i++) {
    const c = fordable[rng.int(0, fordable.length - 1)];
    g.setSym(c, roles.ford);
  }

  // 6. Buildings. Army 0's set is placed, then rotated for the others.
  const buildings: MapBuildingPlacement[] = [];
  const taken = new Set<number>();
  const reachable = footReachable(g, keep0);
  const buildable = (c: Coord) => {
    if (!g.inside(c.x, c.y) || taken.has(c.y * w + c.x) || !reachable.has(c.y * w + c.x)) return false;
    const t = TERRAIN[g.get(c.x, c.y)];
    return !!t && t.moveCost.foot !== undefined && t.autotile !== 'water' && t.autotile !== 'bridge' && t.defense < 4;
  };
  const place = (type: string, c: Coord, owner: number | null) => {
    for (const p of g.orbit(c)) {
      const rotations = orbitIndex(g, c, p);
      buildings.push({ type, x: p.x, y: p.y, owner: owner === null ? null : (owner + rotations) % o.players });
      taken.add(p.y * w + p.x);
      g.set(p.x, p.y, roles.clear); // buildings stand on open ground
    }
  };
  const near = (from: Coord, minD: number, maxD: number): Coord | null => {
    const options: Coord[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (d >= minD && d <= maxD && buildable({ x, y }) && farFromBuildings({ x, y }, 2)) options.push({ x, y });
      }
    }
    return options.length ? rng.pick(options) : null;
  };
  const farFromBuildings = (c: Coord, min: number) => buildings.every((b) => Math.abs(b.x - c.x) + Math.abs(b.y - c.y) >= min);

  place('keep', keep0, 0);
  const barracks0 = near(keep0, 2, 3);
  if (barracks0) place('barracks', barracks0, 0);
  const home = near(keep0, 2, 4);
  if (home) place('village', home, 0);
  // neutral villages anywhere reachable, spread out, not too close to a keep
  const keeps = buildings.filter((b) => b.type === 'keep');
  const wanted = VILLAGES_PER_ARMY[o.buildings];
  for (let tries = 0, placed = 0; placed < wanted && tries < 400; tries++) {
    const c = { x: rng.int(1, w - 2), y: rng.int(1, h - 2) };
    if (!buildable(c) || !farFromBuildings(c, 3)) continue;
    if (keeps.some((k) => Math.abs(k.x - c.x) + Math.abs(k.y - c.y) < 5)) continue;
    const orbit = g.orbit(c);
    if (orbit.length < o.players || !orbit.every((p) => buildable(p) && farFromBuildings(p, 3))) continue;
    place('village', c, null);
    placed++;
  }
  // one neutral barracks per army on medium and large maps, in contested ground
  if (o.size !== 'small') {
    for (let tries = 0; tries < 200; tries++) {
      const c = { x: rng.int(2, w - 3), y: rng.int(2, h - 3) };
      const dKeep = Math.abs(c.x - keep0.x) + Math.abs(c.y - keep0.y);
      if (dKeep < (w + h) / 4 || !buildable(c) || !farFromBuildings(c, 3)) continue;
      const orbit = g.orbit(c);
      if (orbit.length < o.players || !orbit.every((p) => buildable(p) && farFromBuildings(p, 3))) continue;
      place('barracks', c, null);
      break;
    }
  }

  // 7. Starting armies around each keep.
  const units: MapUnitPlacement[] = [];
  const army = RULES.startingArmy.filter((t) => t in UNITS);
  const spots = startingSpots(g, keep0, buildings, army.length);
  army.forEach((type, i) => {
    const c = spots[i];
    if (!c) return;
    g.orbit(c).forEach((p) => {
      units.push({ type, owner: orbitIndex(g, c, p) % o.players, x: p.x, y: p.y });
    });
  });

  const factionIds = o.factions ?? Object.keys(FACTIONS);
  const name = mapName(o.seed);
  return {
    id: generatedMapId(o),
    name,
    description: `${biome.desc ? `${biome.desc} ` : ''}Generated from seed ${o.seed}.`,
    rows: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => TERRAIN[g.get(x, y)].char).join('')),
    players: Array.from({ length: o.players }, (_, i) => ({ faction: factionIds[i % factionIds.length], controller: i === 0 ? 'human' : 'ai' })),
    units,
    buildings,
    startingGold: RULES.startingGold,
    fog: biome.fog ?? false,
  };
}

/** How many symmetry steps take `from` to `to` (0 if they are the same tile). */
function orbitIndex(g: Grid, from: Coord, to: Coord): number {
  let p = from;
  for (let k = 0; k < g.turns; k++) {
    if (p.x === to.x && p.y === to.y) return k;
    p = g.rotate(p);
  }
  return 0;
}

/** Cheapest 4-way path between two tiles under a per-terrain cost function (Dijkstra). */
function cheapestPath(g: Grid, from: Coord, to: Coord, cost: (id: string) => number): Coord[] {
  const n = g.w * g.h;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const start = from.y * g.w + from.x;
  const goal = to.y * g.w + to.x;
  dist[start] = 0;
  const open = new Set<number>([start]);
  while (open.size) {
    let cur = -1;
    let best = Infinity;
    for (const i of open) if (dist[i] < best) {
      best = dist[i];
      cur = i;
    }
    open.delete(cur);
    if (cur === goal) break;
    const cx = cur % g.w;
    const cy = Math.floor(cur / g.w);
    for (const d of DIRECTIONS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!g.inside(nx, ny)) continue;
      const ni = ny * g.w + nx;
      const nd = best + cost(g.get(nx, ny));
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = cur;
        open.add(ni);
      }
    }
  }
  const path: Coord[] = [];
  for (let i = goal; i !== -1; i = prev[i]) path.push({ x: i % g.w, y: Math.floor(i / g.w) });
  return path.reverse();
}

/** Tiles a foot unit could walk to from `from`. */
function footReachable(g: Grid, from: Coord): Set<number> {
  const seen = new Set<number>([from.y * g.w + from.x]);
  const queue: Coord[] = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of DIRECTIONS) {
      const x = c.x + d.x;
      const y = c.y + d.y;
      if (!g.inside(x, y) || seen.has(y * g.w + x)) continue;
      if (TERRAIN[g.get(x, y)]?.moveCost.foot === undefined) continue;
      seen.add(y * g.w + x);
      queue.push({ x, y });
    }
  }
  return seen;
}

/** Free tiles next to the keep for the starting army, nearest first (never on buildings). */
function startingSpots(g: Grid, keep: Coord, buildings: MapBuildingPlacement[], count: number): Coord[] {
  const occupied = new Set(buildings.map((b) => b.y * g.w + b.x));
  const out: Coord[] = [];
  for (let r = 1; r <= 4 && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy++) {
      for (let dx = -r; dx <= r && out.length < count; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const c = { x: keep.x + dx, y: keep.y + dy };
        if (!g.inside(c.x, c.y) || occupied.has(c.y * g.w + c.x)) continue;
        const t = TERRAIN[g.get(c.x, c.y)];
        // every unit type must be able to stand here
        if (!t || Object.values(UNITS).some((u) => t.moveCost[u.moveType] === undefined)) continue;
        // keep the symmetric images apart from this army's spots
        if (g.orbit(c).length < g.turns) continue;
        out.push(c);
        occupied.add(c.y * g.w + c.x);
      }
    }
  }
  return out;
}

/** Biome ids available to the generator. */
export function biomeIds(): string[] {
  return Object.keys(BIOMES);
}
