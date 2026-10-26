// Registry of bundled maps. To add a map, drop a JSON file in this folder and list it here.
import type { MapDef } from '../../core/types';
import greenvale from './greenvale.json';

export const MAP_LIST: MapDef[] = [greenvale as MapDef];
