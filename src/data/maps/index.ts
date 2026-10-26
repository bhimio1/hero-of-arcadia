// Registry of bundled maps. To add a map, drop a JSON file in this folder and list it here.
import type { MapDef } from '../../core/types';
import firstFord from './first-ford.json';
import greenvale from './greenvale.json';

export const MAP_LIST: MapDef[] = [firstFord as MapDef, greenvale as MapDef];
