import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { Content, ItemSlot } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import type { RolledAffix } from '../../sim/world/types.ts';
import { exchange } from './api.ts';
import type { Answer, CharacterProfile, FetchFn, ProfileBuild, ProfileLookup, ProfileStats, WornItem } from './api.ts';

export const PROFILE_LIMITS: { readonly nameChars: number; readonly placeChars: number; readonly bar: number } = { nameChars: 32, placeChars: 64, bar: 12 };

const MISSING_CODE: string = 'no_such_character';

function whole(source: Fields, key: string): number {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function shortText(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value !== '' && value.length <= limit ? value : null;
}

function readFound(content: Content, value: unknown): Readonly<Record<string, number>> {
  const found: Record<string, number> = {};
  if (!isFields(value)) return found;
  for (const rarity of content.rarities) {
    const counted: number = whole(value, rarity.id);
    if (counted > 0) found[rarity.id] = counted;
  }
  return found;
}

function readStats(content: Content, value: unknown): ProfileStats {
  const source: Fields = isFields(value) ? value : {};
  return {
    playedMs: whole(source, 'playedMs'),
    kills: whole(source, 'kills'),
    bosses: whole(source, 'bosses'),
    deaths: whole(source, 'deaths'),
    bestLevel: whole(source, 'bestLevel'),
    biggestHit: whole(source, 'biggestHit'),
    goldLooted: whole(source, 'goldLooted'),
    moments: whole(source, 'moments'),
    quests: whole(source, 'quests'),
    found: readFound(content, source['found']),
  };
}

function readAffix(content: Content, value: unknown): RolledAffix | null {
  if (!isFields(value)) return null;
  const affix: unknown = value['affix'];
  const rolled: unknown = value['value'];
  return typeof affix === 'string' && content.affixes.has(affix) && typeof rolled === 'number' && Number.isFinite(rolled) ? { affix, value: rolled } : null;
}

function readSlot(value: unknown): ItemSlot | null {
  return ITEM_SLOTS.find((slot: ItemSlot): boolean => slot === value) ?? null;
}

function readWorn(content: Content, value: unknown): WornItem | null {
  if (!isFields(value)) return null;
  const slot: ItemSlot | null = readSlot(value['slot']);
  const base: unknown = value['base'];
  const rarity: unknown = value['rarity'];
  const level: number = whole(value, 'level');
  const affixes: unknown = value['affixes'];
  if (slot === null || typeof base !== 'string' || typeof rarity !== 'string' || level < 1 || !Array.isArray(affixes)) return null;
  if (content.itemBases.get(base)?.slot !== slot || !content.rarities.some((entry): boolean => entry.id === rarity)) return null;
  const list: readonly unknown[] = affixes;
  const rolled: RolledAffix[] = list.map((entry: unknown): RolledAffix | null => readAffix(content, entry)).filter((entry: RolledAffix | null): entry is RolledAffix => entry !== null);
  return { slot, base, rarity, level, affixes: rolled };
}

function readWornList(content: Content, value: unknown): readonly WornItem[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const worn: WornItem[] = [];
  for (const entry of list.slice(0, ITEM_SLOTS.length)) {
    const item: WornItem | null = readWorn(content, entry);
    if (item !== null && !worn.some((held: WornItem): boolean => held.slot === item.slot)) worn.push(item);
  }
  return worn;
}

function readBuild(content: Content, value: unknown): ProfileBuild | null {
  if (!isFields(value) || !Array.isArray(value['bar'])) return null;
  const bar: readonly unknown[] = value['bar'];
  return {
    bar: bar.slice(0, PROFILE_LIMITS.bar).map((entry: unknown): string | null => (typeof entry === 'string' && content.skills.has(entry) ? entry : null)),
    places: whole(value, 'places'),
  };
}

export function readProfile(content: Content, value: unknown): CharacterProfile | null {
  if (!isFields(value)) return null;
  const name: string | null = shortText(value['name'], PROFILE_LIMITS.nameChars);
  const level: number = whole(value, 'level');
  if (name === null || level < 1) return null;
  const hero: unknown = value['hero'];
  return {
    name,
    hero: typeof hero === 'string' && content.player.heroes.some((entry): boolean => entry.id === hero) ? hero : null,
    level,
    furthest: shortText(value['furthest'], PROFILE_LIMITS.placeChars) ?? '',
    online: value['online'] === true,
    stats: readStats(content, value['stats']),
    worn: readWornList(content, value['worn']),
    build: readBuild(content, value['build']),
  };
}

export function profilePath(name: string): string {
  return `/v1/profile?name=${encodeURIComponent(name)}`;
}

function missing(answer: Answer): boolean {
  const error: unknown = isFields(answer.body) ? answer.body['error'] : null;
  return isFields(error) && error['code'] === MISSING_CODE;
}

export function lookupOf(content: Content, answer: Answer | null): ProfileLookup {
  if (answer === null) return { kind: 'failed' };
  if (answer.status >= 200 && answer.status < 300) {
    const profile: CharacterProfile | null = readProfile(content, answer.body);
    return profile === null ? { kind: 'failed' } : { kind: 'ok', profile };
  }
  if (answer.status === 404) return missing(answer) ? { kind: 'missing' } : { kind: 'unsupported' };
  if (answer.status === 405 || answer.status === 501) return { kind: 'unsupported' };
  return { kind: 'failed' };
}

export interface ProfileApi {
  profile(name: string, signal: AbortSignal): Promise<ProfileLookup>;
}

export function createProfileApi(content: Content, baseUrl: string, fetchFn: FetchFn): ProfileApi {
  return {
    async profile(name: string, signal: AbortSignal): Promise<ProfileLookup> {
      return lookupOf(content, await exchange(fetchFn, `${baseUrl}${profilePath(name)}`, { method: 'GET', signal }));
    },
  };
}
