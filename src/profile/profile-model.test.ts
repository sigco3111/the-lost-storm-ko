import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ItemBaseDef } from '../../sim/content/types.ts';
import { heroRig } from '../../sim/hero.ts';
import { heroBase, lookOf } from '../../sim/wear.ts';
import type { CharacterProfile } from '../backend/api.ts';
import { must } from '../../test/support.ts';
import { buildSkills, placesText, profileFigure, profileHeadline, profileSlots } from './profile-model.ts';

const content: Content = loadContent();
const weapon: ItemBaseDef = must([...content.itemBases.values()].find((base: ItemBaseDef): boolean => base.slot === 'weapon'), 'a weapon base');
const [rarity] = content.rarities;
const [hero] = content.player.heroes;
const [skill, other] = [...content.skills.values()];

function profile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return {
    name: 'Rook',
    hero: must(hero, 'a hero').id,
    level: 7,
    furthest: 'Stillhold',
    online: true,
    stats: { playedMs: 0, kills: 0, bosses: 0, deaths: 0, bestLevel: 7, biggestHit: 0, goldLooted: 0, moments: 0, quests: 0, found: {} },
    worn: [{ slot: 'weapon', base: weapon.id, rarity: must(rarity, 'a rarity').id, level: 6, affixes: [] }],
    build: null,
    ...overrides,
  };
}

void test('every slot is listed in order, worn ones as items that cannot share an id with your own or with an earlier profile', (): void => {
  const slots = profileSlots(profile(), 0);
  assert.deepEqual(slots.map((entry) => entry.slot), ['weapon', 'head', 'chest', 'hands', 'legs', 'feet', 'charm']);
  const held = must(slots[0]?.item, 'the weapon');
  assert.equal(held.base, weapon.id);
  assert.equal(held.level, 6);
  assert.ok(held.uid < 0);
  assert.equal(held.ledger, null);
  assert.ok(slots.slice(1).every((entry) => entry.item === null));
  const later = must(profileSlots(profile(), 1)[0]?.item, 'the weapon of the next profile');
  assert.notEqual(later.uid, held.uid);
});

void test('the headline reads level, who woke and how far, and leaves out an unknown zone', (): void => {
  const name: string = must(hero, 'a hero').name;
  assert.equal(profileHeadline(content, profile()), `Level 7 · ${name} · Stillhold`);
  assert.equal(profileHeadline(content, profile({ furthest: '' })), `Level 7 · ${name}`);
});

void test('the build names the skills on the bar once each and counts the tree points', (): void => {
  const first = must(skill, 'a skill');
  const second = must(other, 'another skill');
  assert.deepEqual(buildSkills(content, { bar: [first.id, null, second.id, first.id], places: 3 }), [first.name, second.name]);
  assert.deepEqual(buildSkills(content, null), []);
  assert.equal(placesText(1), '1 Skill Tree point spent');
  assert.equal(placesText(12), '12 Skill Tree points spent');
});

void test('the figure is dressed by the same rule as everyone else in the world', (): void => {
  const shown = profile();
  const figure = profileFigure(content, shown);
  const rig: string = heroRig(content, shown.hero);
  assert.equal(figure.rig, rig);
  assert.deepEqual(figure.look, lookOf(content, rig, heroBase(content, rig), { weapon: { base: weapon.id }, head: null, chest: null, hands: null, legs: null, feet: null, charm: null }));
  assert.notEqual(profileFigure(content, profile({ worn: [] })).key, figure.key);
});
