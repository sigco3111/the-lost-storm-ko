import { loadContent } from '../sim/content/content.ts';
import type { Content, ZoneDef } from '../sim/content/types.ts';

const shipped: Content = loadContent();
export const UNRANKED_CONTENT: Content = { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones].map(([id, zone]: [string, ZoneDef]): [string, ZoneDef] => [id, { ...zone, ranks: false }])) };
