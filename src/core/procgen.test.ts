import { describe, expect, it } from 'vitest';
import { BIOMES, getContent, parseMapTerrain, TERRAIN, UNITS, RULES } from './data';
import { generateMap, MAP_SIZES, type GenOptions } from './procgen';
import { checkMap } from './validate';
import type { MapDef } from './types';

const BIOME_IDS = Object.keys(BIOMES);

/** Flood fill for a move type over the map's terrain (buildings count as passable). */
function reachable(map: MapDef, moveType: string, from: { x: number; y: number }): Set<number> {
  const { width, height, terrain } = parseMapTerrain(map);
  const buildings = new Set((map.buildings ?? []).map((b) => b.y * width + b.x));
  const ok = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && (buildings.has(y * width + x) || TERRAIN[terrain[y * width + x]].moveCost[moveType] !== undefined);
  const seen = new Set([from.y * width + from.x]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (ok(x, y) && !seen.has(y * width + x)) {
        seen.add(y * width + x);
        queue.push({ x, y });
      }
    }
  }
  return seen;
}

function rotate(map: MapDef, x: number, y: number, players: number) {
  const w = map.rows[0].length;
  const h = map.rows.length;
  return players === 2 ? { x: w - 1 - x, y: h - 1 - y } : { x: w - 1 - y, y: x };
}

const cases: GenOptions[] = [];
for (const biome of BIOME_IDS) {
  for (const players of [2, 4] as const) {
    for (const size of ['small', 'medium', 'large'] as const) {
      for (const seed of [1, 2, 3]) cases.push({ seed: seed * 7919 + players, biome, players, size, buildings: 'normal' });
    }
  }
}

describe('procedural maps', () => {
  it('are deterministic and depend on the seed', () => {
    const o: GenOptions = { seed: 42, biome: 'temperate', players: 2, size: 'medium', buildings: 'normal' };
    expect(generateMap(o)).toEqual(generateMap(o));
    expect(generateMap({ ...o, seed: 43 }).rows).not.toEqual(generateMap(o).rows);
  });

  it(`are valid, fair and fully connected (${cases.length} combinations)`, () => {
    for (const o of cases) {
      const label = JSON.stringify(o);
      const map = generateMap(o);
      expect(checkMap(map, getContent()), label).toBeNull();
      const [w, h] = MAP_SIZES[o.players][o.size];
      expect([map.rows[0].length, map.rows.length], label).toEqual([w, h]);

      // symmetric terrain: every tile matches its rotated image
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const r = rotate(map, x, y, o.players);
          if (map.rows[y][x] !== map.rows[r.y][r.x]) throw new Error(`${label}: asymmetric at ${x},${y}`);
        }
      }

      // every army gets the same buildings and the same starting army
      const keeps = (map.buildings ?? []).filter((b) => b.type === 'keep');
      expect(keeps.length, label).toBe(o.players);
      for (let p = 0; p < o.players; p++) {
        expect(keeps.some((k) => k.owner === p), label).toBe(true);
        expect(map.units.filter((u) => u.owner === p).length, label).toBe(RULES.startingArmy.length);
        const owned = (map.buildings ?? []).filter((b) => b.owner === p).length;
        expect(owned, label).toBe((map.buildings ?? []).filter((b) => b.owner === 0).length);
      }
      expect((map.buildings ?? []).filter((b) => b.owner === null).length % o.players, label).toBe(0);

      // every keep can reach every other keep with every move type
      for (const mt of new Set(Object.values(UNITS).map((u) => u.moveType))) {
        const seen = reachable(map, mt, keeps[0]);
        for (const k of keeps) expect(seen.has(k.y * w + k.x), `${label} ${mt} to keep ${k.owner}`).toBe(true);
      }
    }
  });

  it('honour the building density', () => {
    const count = (b: GenOptions['buildings']) =>
      (generateMap({ seed: 5, biome: 'steppe', players: 2, size: 'large', buildings: b }).buildings ?? []).filter((x) => x.type === 'village').length;
    expect(count('few')).toBeLessThan(count('normal'));
    expect(count('normal')).toBeLessThan(count('many'));
  });
});
