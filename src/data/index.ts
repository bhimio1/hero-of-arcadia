// The base game's content pack: every JSON data file bundled into one object.
// Maps are picked up automatically from ./maps/*.json.
import type { ContentPack } from '../core/content';
import type { MapDef } from '../core/types';
import biomes from './biomes.json';
import buildings from './buildings.json';
import factions from './factions.json';
import moveTypes from './moveTypes.json';
import rules from './rules.json';
import terrain from './terrain.json';
import units from './units.json';

const mapModules = import.meta.glob<MapDef>('./maps/*.json', { eager: true, import: 'default' });

/** Bundled maps in a stable order (a fixed showcase order first, then the rest by id). */
function bundledMaps(): MapDef[] {
  const maps = Object.values(mapModules);
  const order = ['first-ford', 'greenvale', 'highland-pass', 'wildwood', 'four-crowns'];
  return maps.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.id.localeCompare(b.id);
  });
}

export const BASE_PACK: ContentPack = {
  moveTypes,
  terrain,
  units,
  buildings,
  factions,
  biomes,
  rules,
  maps: bundledMaps(),
} as unknown as ContentPack;
