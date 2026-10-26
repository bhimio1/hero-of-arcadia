import type { Coord } from './types';

/** Neighbour order is fixed (N, E, S, W) so pathfinding is deterministic. */
export const DIRECTIONS: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function toIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function fromIndex(width: number, index: number): Coord {
  return { x: index % width, y: Math.floor(index / width) };
}

export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function neighbors(width: number, height: number, c: Coord): Coord[] {
  const out: Coord[] = [];
  for (const d of DIRECTIONS) {
    const x = c.x + d.x;
    const y = c.y + d.y;
    if (inBounds(width, height, x, y)) out.push({ x, y });
  }
  return out;
}

/** All in-bounds tiles whose Manhattan distance from `c` is within [min, max]. */
export function tilesInRange(width: number, height: number, c: Coord, min: number, max: number): Coord[] {
  const out: Coord[] = [];
  for (let dy = -max; dy <= max; dy++) {
    const rest = max - Math.abs(dy);
    for (let dx = -rest; dx <= rest; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < min) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      if (inBounds(width, height, x, y)) out.push({ x, y });
    }
  }
  return out;
}
