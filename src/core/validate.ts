// Validation for merged content. Every problem is reported with a path such as
// "units.archer.range" so modders can find it, and all problems are collected (not just
// the first) so a broken pack can be fixed in one pass.

import type { Content } from './content';
import type { Effect, MapDef, UnitFilter } from './types';

export interface ContentIssue {
  path: string;
  message: string;
}

const AUTOTILES = ['road', 'bridge', 'water'];
const STATS = ['attack', 'defense', 'move', 'vision', 'maxHp', 'rangeMin', 'rangeMax'];
const EFFECTS = ['unitStat', 'unitCost', 'moveCost', 'terrainDefense', 'income', 'heal', 'captureStrength', 'damageVs'];

class Checker {
  issues: ContentIssue[] = [];

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  str(v: unknown, path: string, opts: { optional?: boolean; len?: number } = {}): boolean {
    if (v === undefined && opts.optional) return true;
    if (typeof v !== 'string' || v.length === 0) return this.no(path, 'must be a non-empty string');
    if (opts.len !== undefined && v.length !== opts.len) return this.no(path, `must be exactly ${opts.len} character(s)`);
    return true;
  }

  num(v: unknown, path: string, opts: { optional?: boolean; min?: number; max?: number; int?: boolean } = {}): boolean {
    if (v === undefined && opts.optional) return true;
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.no(path, 'must be a number');
    if (opts.int && !Number.isInteger(v)) return this.no(path, 'must be a whole number');
    if (opts.min !== undefined && v < opts.min) return this.no(path, `must be at least ${opts.min}`);
    if (opts.max !== undefined && v > opts.max) return this.no(path, `must be at most ${opts.max}`);
    return true;
  }

  bool(v: unknown, path: string, optional = false): boolean {
    if (v === undefined && optional) return true;
    if (typeof v !== 'boolean') return this.no(path, 'must be true or false');
    return true;
  }

  list(v: unknown, path: string, optional = false): v is unknown[] {
    if (v === undefined && optional) return false;
    if (!Array.isArray(v)) {
      this.fail(path, 'must be a list');
      return false;
    }
    return true;
  }

  obj(v: unknown, path: string, optional = false): v is Record<string, unknown> {
    if (v === undefined && optional) return false;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      this.fail(path, 'must be an object');
      return false;
    }
    return true;
  }

  ref(v: unknown, table: Record<string, unknown>, kind: string, path: string): boolean {
    if (typeof v !== 'string' || !(v in table)) return this.no(path, `unknown ${kind} "${String(v)}"`);
    return true;
  }

  private no(path: string, message: string): false {
    this.fail(path, message);
    return false;
  }
}

function checkFilter(c: Checker, f: UnitFilter, content: Content, path: string): void {
  if (c.list(f.units, `${path}.units`, true)) f.units!.forEach((u, i) => c.ref(u, content.units, 'unit', `${path}.units[${i}]`));
  if (c.list(f.tags, `${path}.tags`, true)) f.tags!.forEach((t, i) => c.str(t, `${path}.tags[${i}]`));
}

function checkEffect(c: Checker, e: Effect, content: Content, path: string): void {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) {
    c.fail(path, 'must be an object');
    return;
  }
  if (!EFFECTS.includes(e.type)) {
    c.fail(`${path}.type`, `must be one of ${EFFECTS.join(', ')}`);
    return;
  }
  const terrainOrBuilding = { ...content.terrain, ...content.buildings };
  switch (e.type) {
    case 'unitStat':
      if (!STATS.includes(e.stat)) c.fail(`${path}.stat`, `must be one of ${STATS.join(', ')}`);
      c.num(e.add, `${path}.add`, { optional: true });
      c.num(e.mul, `${path}.mul`, { optional: true, min: 0 });
      checkFilter(c, e, content, path);
      break;
    case 'unitCost':
      c.num(e.add, `${path}.add`, { optional: true });
      c.num(e.mul, `${path}.mul`, { optional: true, min: 0 });
      checkFilter(c, e, content, path);
      break;
    case 'moveCost':
      if (c.list(e.terrain, `${path}.terrain`)) e.terrain.forEach((t, i) => c.ref(t, terrainOrBuilding, 'terrain', `${path}.terrain[${i}]`));
      if (c.list(e.moveTypes, `${path}.moveTypes`, true)) e.moveTypes!.forEach((m, i) => c.ref(m, content.moveTypes, 'move type', `${path}.moveTypes[${i}]`));
      if (e.set !== undefined && e.set !== null) c.num(e.set, `${path}.set`, { min: 1 });
      c.num(e.add, `${path}.add`, { optional: true });
      break;
    case 'terrainDefense':
      if (c.list(e.terrain, `${path}.terrain`, true)) e.terrain!.forEach((t, i) => c.ref(t, terrainOrBuilding, 'terrain', `${path}.terrain[${i}]`));
      c.bool(e.ownBuildings, `${path}.ownBuildings`, true);
      c.num(e.add, `${path}.add`);
      checkFilter(c, e, content, path);
      break;
    case 'income':
      c.num(e.add, `${path}.add`, { optional: true });
      c.num(e.mul, `${path}.mul`, { optional: true, min: 0 });
      break;
    case 'heal':
      c.num(e.buildings, `${path}.buildings`, { optional: true, min: 0 });
      c.num(e.anywhere, `${path}.anywhere`, { optional: true, min: 0 });
      break;
    case 'captureStrength':
      c.num(e.add, `${path}.add`);
      checkFilter(c, e, content, path);
      break;
    case 'damageVs':
      c.num(e.mul, `${path}.mul`, { min: 0 });
      checkFilter(c, e, content, path);
      if (c.obj(e.vs, `${path}.vs`)) checkFilter(c, e.vs, content, `${path}.vs`);
      break;
  }
}

/** Describes what is wrong with a map, or returns null if it is playable. */
export function checkMap(map: MapDef, content: Content): string | null {
  const c = new Checker();
  const p = `map`;
  if (!c.str(map.name, `${p}.name`) || !c.list(map.rows, `${p}.rows`) || !c.list(map.players, `${p}.players`) || !c.list(map.units, `${p}.units`)) {
    return c.issues.map((i) => `${i.path} ${i.message}`).join('; ');
  }
  const byChar: Record<string, string> = {};
  for (const t of Object.values(content.terrain)) byChar[t.char] = t.id;
  const height = map.rows.length;
  if (height === 0) return 'has no rows';
  const width = map.rows[0].length;
  if (width === 0) return 'has empty rows';
  const terrain: string[] = [];
  for (let y = 0; y < height; y++) {
    const row = map.rows[y];
    if (typeof row !== 'string' || row.length !== width) return `row ${y} has length ${row?.length}, expected ${width}`;
    for (const ch of row) {
      const id = map.legend?.[ch] ?? byChar[ch];
      if (!id || !(id in content.terrain)) return `unknown terrain char "${ch}" in row ${y}`;
      terrain.push(id);
    }
  }
  if (map.players.length < 2) return 'needs at least two players';
  for (const pl of map.players) if (!(pl.faction in content.factions)) return `unknown faction ${pl.faction}`;
  const occupied = new Set<number>();
  for (const u of map.units) {
    if (!(u.type in content.units)) return `unknown unit type ${u.type}`;
    if (!(u.owner >= 0 && u.owner < map.players.length)) return `bad unit owner ${u.owner}`;
    if (!(u.x >= 0 && u.y >= 0 && u.x < width && u.y < height)) return `unit out of bounds at ${u.x},${u.y}`;
    const idx = u.y * width + u.x;
    if (occupied.has(idx)) return `two units at ${u.x},${u.y}`;
    occupied.add(idx);
    const cost = content.terrain[terrain[idx]].moveCost[content.units[u.type].moveType];
    if (cost === undefined) return `${u.type} placed on impassable ${terrain[idx]} at ${u.x},${u.y}`;
  }
  for (let pl = 0; pl < map.players.length; pl++) {
    if (!map.units.some((u) => u.owner === pl)) return `player ${pl} has no starting units`;
  }
  const bseen = new Set<number>();
  for (const b of map.buildings ?? []) {
    if (!(b.type in content.buildings)) return `unknown building ${b.type}`;
    if (!(b.x >= 0 && b.y >= 0 && b.x < width && b.y < height)) return `building out of bounds at ${b.x},${b.y}`;
    const idx = b.y * width + b.x;
    if (bseen.has(idx)) return `two buildings at ${b.x},${b.y}`;
    bseen.add(idx);
    const t = content.terrain[terrain[idx]];
    if (t.moveCost.foot === undefined || t.autotile === 'water' || t.autotile === 'bridge') return `building on ${t.id} at ${b.x},${b.y}`;
    if (!(b.owner === null || (b.owner >= 0 && b.owner < map.players.length))) return `bad building owner ${b.owner}`;
  }
  return null;
}

export function validateContent(content: Content): { errors: ContentIssue[]; badMaps: Map<string, string> } {
  const c = new Checker();
  const ids = <T>(table: Record<string, T>) => Object.entries(table);

  if (Object.keys(content.moveTypes).length === 0) c.fail('moveTypes', 'at least one move type is required');
  for (const [id, m] of ids(content.moveTypes)) c.str(m.name, `moveTypes.${id}.name`);

  const chars = new Map<string, string>();
  for (const [id, t] of ids(content.terrain)) {
    const p = `terrain.${id}`;
    c.str(t.name, `${p}.name`);
    if (c.str(t.char, `${p}.char`, { len: 1 })) {
      if (chars.has(t.char)) c.fail(`${p}.char`, `"${t.char}" is already used by ${chars.get(t.char)}`);
      chars.set(t.char, id);
    }
    c.num(t.defense, `${p}.defense`);
    if (c.obj(t.moveCost, `${p}.moveCost`)) {
      for (const [mt, cost] of Object.entries(t.moveCost)) {
        c.ref(mt, content.moveTypes, 'move type', `${p}.moveCost.${mt}`);
        c.num(cost, `${p}.moveCost.${mt}`, { min: 1 });
      }
    }
    c.str(t.sprite, `${p}.sprite`);
    if (t.autotile !== undefined && !AUTOTILES.includes(t.autotile)) c.fail(`${p}.autotile`, `must be one of ${AUTOTILES.join(', ')}`);
    c.bool(t.hides, `${p}.hides`, true);
    c.num(t.visionBonus, `${p}.visionBonus`, { optional: true, int: true });
    c.num(t.minimap, `${p}.minimap`, { optional: true, int: true, min: 0, max: 31 });
  }

  if (Object.keys(content.units).length === 0) c.fail('units', 'at least one unit is required');
  for (const [id, u] of ids(content.units)) {
    const p = `units.${id}`;
    c.str(u.name, `${p}.name`);
    c.num(u.cost, `${p}.cost`, { min: 1 });
    c.num(u.maxHp, `${p}.maxHp`, { min: 1, int: true });
    c.num(u.attack, `${p}.attack`, { min: 0 });
    c.num(u.defense, `${p}.defense`);
    c.num(u.move, `${p}.move`, { min: 1, int: true });
    c.ref(u.moveType, content.moveTypes, 'move type', `${p}.moveType`);
    if (c.list(u.range, `${p}.range`)) {
      if (u.range.length !== 2 || !(u.range[0] >= 1) || !(u.range[1] >= u.range[0])) c.fail(`${p}.range`, 'must be [min, max] with 1 <= min <= max');
    }
    c.num(u.vision, `${p}.vision`, { min: 0, int: true });
    c.bool(u.moveAndFire, `${p}.moveAndFire`);
    c.bool(u.counter, `${p}.counter`);
    c.bool(u.canCapture, `${p}.canCapture`);
    if (c.obj(u.bonusVs, `${p}.bonusVs`)) {
      for (const [k, v] of Object.entries(u.bonusVs)) {
        c.ref(k, content.units, 'unit', `${p}.bonusVs.${k}`);
        c.num(v, `${p}.bonusVs.${k}`, { min: 0 });
      }
    }
    if (c.list(u.tags, `${p}.tags`)) u.tags.forEach((t, i) => c.str(t, `${p}.tags[${i}]`));
    c.str(u.sprite, `${p}.sprite`, { optional: true });
    c.str(u.blurb, `${p}.blurb`);
  }

  for (const [id, b] of ids(content.buildings)) {
    const p = `buildings.${id}`;
    c.str(b.name, `${p}.name`);
    c.str(b.char, `${p}.char`, { len: 1 });
    c.num(b.defense, `${p}.defense`);
    c.num(b.income, `${p}.income`, { min: 0 });
    c.num(b.heal, `${p}.heal`, { min: 0 });
    c.num(b.capturePoints, `${p}.capturePoints`, { min: 1 });
    c.bool(b.hq, `${p}.hq`);
    c.num(b.aiValue, `${p}.aiValue`, { min: 0 });
    if (c.list(b.produces, `${p}.produces`)) b.produces.forEach((u, i) => c.ref(u, content.units, 'unit', `${p}.produces[${i}]`));
    if (c.obj(b.moveCost, `${p}.moveCost`)) {
      for (const [mt, cost] of Object.entries(b.moveCost)) {
        c.ref(mt, content.moveTypes, 'move type', `${p}.moveCost.${mt}`);
        c.num(cost, `${p}.moveCost.${mt}`, { min: 1 });
      }
    }
    c.str(b.sprite, `${p}.sprite`, { optional: true });
    c.str(b.blurb, `${p}.blurb`);
  }

  if (Object.keys(content.factions).length < 2) c.fail('factions', 'at least two factions are required');
  for (const [id, f] of ids(content.factions)) {
    const p = `factions.${id}`;
    c.str(f.name, `${p}.name`);
    c.str(f.short, `${p}.short`);
    if (c.list(f.ramp, `${p}.ramp`)) {
      if (f.ramp.length !== 3) c.fail(`${p}.ramp`, 'must list three palette indices [light, mid, dark]');
      f.ramp.forEach((v, i) => c.num(v, `${p}.ramp[${i}]`, { int: true, min: 0, max: 31 }));
    }
    c.str(f.blurb, `${p}.blurb`, { optional: true });
    if (c.list(f.perks, `${p}.perks`, true)) {
      f.perks!.forEach((perk, i) => {
        const pp = `${p}.perks[${i}]`;
        if (!c.obj(perk, pp)) return;
        c.str(perk.name, `${pp}.name`);
        c.str(perk.desc, `${pp}.desc`, { optional: true });
        if (c.list(perk.effects, `${pp}.effects`)) perk.effects.forEach((e, j) => checkEffect(c, e, content, `${pp}.effects[${j}]`));
      });
    }
    if (c.obj(f.roster, `${p}.roster`, true)) {
      const r = f.roster!;
      if (c.obj(r.replace, `${p}.roster.replace`, true)) {
        for (const [from, to] of Object.entries(r.replace!)) {
          c.ref(from, content.units, 'unit', `${p}.roster.replace`);
          c.ref(to, content.units, 'unit', `${p}.roster.replace.${from}`);
        }
      }
      for (const key of ['add', 'remove'] as const) {
        if (c.list(r[key], `${p}.roster.${key}`, true)) r[key]!.forEach((u, i) => c.ref(u, content.units, 'unit', `${p}.roster.${key}[${i}]`));
      }
    }
  }

  for (const [id, b] of ids(content.biomes)) {
    const p = `biomes.${id}`;
    c.str(b.name, `${p}.name`);
    c.num(b.rivers, `${p}.rivers`, { int: true, min: 0, max: 4 });
    c.num(b.scale, `${p}.scale`, { optional: true, min: 1 });
    if (c.list(b.layers, `${p}.layers`)) {
      if (b.layers.length === 0) c.fail(`${p}.layers`, 'needs at least one layer');
      b.layers.forEach((l, i) => {
        const lp = `${p}.layers[${i}]`;
        c.ref(l.terrain, content.terrain, 'terrain', `${lp}.terrain`);
        for (const key of ['elevation', 'moisture'] as const) {
          const r = l[key];
          if (r === undefined) continue;
          if (!Array.isArray(r) || r.length !== 2 || !(r[0] <= r[1])) c.fail(`${lp}.${key}`, 'must be [from, to] with from <= to');
        }
      });
      const last = b.layers[b.layers.length - 1];
      if (last && (last.elevation || last.moisture)) c.fail(`${p}.layers`, 'the last layer must have no ranges (it is the fallback)');
    }
  }

  const r = content.rules;
  if (c.obj(r, 'rules')) {
    c.num(r.defensePerPoint, 'rules.defensePerPoint', { min: 0, max: 1 });
    c.num(r.luckMax, 'rules.luckMax', { min: 0, int: true });
    if (c.obj(r.captureStrength, 'rules.captureStrength')) {
      c.num(r.captureStrength.healthy, 'rules.captureStrength.healthy', { min: 1, int: true });
      c.num(r.captureStrength.wounded, 'rules.captureStrength.wounded', { min: 1, int: true });
      c.num(r.captureStrength.woundedBelow, 'rules.captureStrength.woundedBelow', { min: 0, max: 1 });
    }
    c.num(r.scorePerBuilding, 'rules.scorePerBuilding', { min: 0 });
    c.num(r.startingGold, 'rules.startingGold', { min: 0 });
    if (c.list(r.startingArmy, 'rules.startingArmy')) {
      if (r.startingArmy.length === 0) c.fail('rules.startingArmy', 'needs at least one unit');
      r.startingArmy.forEach((u, i) => c.ref(u, content.units, 'unit', `rules.startingArmy[${i}]`));
    }
  }

  // Maps are checked last and individually: a bad map is dropped, not fatal.
  const badMaps = new Map<string, string>();
  if (c.issues.length === 0) {
    for (const [id, m] of ids(content.maps)) {
      const problem = checkMap(m, content);
      if (problem) badMaps.set(id, problem);
    }
  }
  return { errors: c.issues, badMaps };
}
