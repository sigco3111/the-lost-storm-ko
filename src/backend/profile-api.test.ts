import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ItemBaseDef } from '../../sim/content/types.ts';
import { must } from '../../test/support.ts';
import type { Answer, ProfileLookup } from './api.ts';
import { createProfileApi, lookupOf, profilePath, readProfile } from './profile-api.ts';

const content: Content = loadContent();
const weapon: ItemBaseDef = must([...content.itemBases.values()].find((base: ItemBaseDef): boolean => base.slot === 'weapon'), 'a weapon');
const affix: string = must([...content.affixes.keys()][0], 'an affix');
const rarity: string = must(content.rarities[0], 'a rarity').id;
const hero: string = must(content.player.heroes[0], 'a hero').id;

const PROFILE: Readonly<Record<string, unknown>> = {
  name: 'Rook',
  hero,
  level: 5,
  furthest: 'Stillhold',
  online: true,
  stats: { playedMs: 60_000, kills: 12, bosses: 1, deaths: 2, bestLevel: 5, biggestHit: 90, goldLooted: 300, moments: 1, quests: 2, found: { [rarity]: 4, made_up: 9 } },
  worn: [{ slot: 'weapon', base: weapon.id, rarity, level: 3, affixes: [{ affix, value: 4 }, { affix: 'made_up', value: 1 }] }],
  build: { bar: ['cleave', 'made_up'], places: 3 },
};

function answer(status: number, body: unknown): Answer {
  return { status, retryAfter: null, body };
}

void test('a profile is read with its stats, worn items and build, keeping only what the game knows', (): void => {
  const profile = must(readProfile(content, PROFILE), 'profile');
  assert.equal(profile.name, 'Rook');
  assert.equal(profile.hero, hero);
  assert.equal(profile.stats.kills, 12);
  assert.deepEqual(profile.stats.found, { [rarity]: 4 });
  assert.deepEqual(profile.worn, [{ slot: 'weapon', base: weapon.id, rarity, level: 3, affixes: [{ affix, value: 4 }] }]);
  assert.deepEqual(profile.build, { bar: ['cleave', null], places: 3 });
});

void test('an item in the wrong slot, an unknown base or a second item for one slot is dropped, and bad numbers read as zero', (): void => {
  const worn = [
    { slot: 'head', base: weapon.id, rarity, level: 3, affixes: [] },
    { slot: 'weapon', base: 'made_up', rarity, level: 3, affixes: [] },
    { slot: 'weapon', base: weapon.id, rarity, level: 2, affixes: [] },
    { slot: 'weapon', base: weapon.id, rarity, level: 4, affixes: [] },
  ];
  const profile = must(readProfile(content, { ...PROFILE, worn, stats: { kills: -4, deaths: 'many', playedMs: 1.5 }, hero: 'nobody' }), 'profile');
  assert.deepEqual(profile.worn.map((item) => item.level), [2]);
  assert.equal(profile.stats.kills, 0);
  assert.equal(profile.stats.deaths, 0);
  assert.equal(profile.stats.playedMs, 0);
  assert.equal(profile.hero, null);
  assert.equal(readProfile(content, { ...PROFILE, name: '' }), null);
  assert.equal(readProfile(content, 'nothing'), null);
});

void test('a missing character, an older server and a failure are told apart', (): void => {
  assert.equal(lookupOf(content, answer(200, PROFILE)).kind, 'ok');
  assert.deepEqual(lookupOf(content, answer(404, { error: { code: 'no_such_character', message: '' } })), { kind: 'missing' });
  assert.deepEqual(lookupOf(content, answer(404, { error: { code: 'not_found', message: '' } })), { kind: 'unsupported' });
  assert.deepEqual(lookupOf(content, answer(429, null)), { kind: 'failed' });
  assert.deepEqual(lookupOf(content, answer(200, 'garbage')), { kind: 'failed' });
  assert.deepEqual(lookupOf(content, null), { kind: 'failed' });
});

void test('the profile is asked for by name, escaped, with no token', async (): Promise<void> => {
  const asked: { url: string; init: RequestInit }[] = [];
  const api = createProfileApi(content, 'https://game.test', (url: string, init: RequestInit): Promise<Response> => {
    asked.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(PROFILE), { status: 200 }));
  });
  const found: ProfileLookup = await api.profile('Ash Walker', AbortSignal.timeout(1000));
  assert.equal(found.kind, 'ok');
  assert.equal(profilePath('Ash Walker'), '/v1/profile?name=Ash%20Walker');
  const [first] = asked;
  assert.ok(first !== undefined);
  assert.equal(first.url, 'https://game.test/v1/profile?name=Ash%20Walker');
  assert.equal(first.init.headers, undefined);
});
