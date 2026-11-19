import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { emptyEquipment, generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import type { HeroStanding } from '../../sim/hero.ts';
import { canEnter, HERO_KEY, HERO_TEXT, heroChoice, heroLocked, heroNote, keepHero, nameBodyOf, readHero, sameHeroChoice, shownHero, startingHero } from './hero-choice.ts';
import type { HeroChoice, HeroOption } from './hero-choice.ts';

const content: Content = loadContent();

function memory(): KeyValueStore {
  const values: Map<string, string> = new Map<string, string>();
  return {
    read: (key: string): string | null => values.get(key) ?? null,
    write: (key: string, value: string): boolean => {
      values.set(key, value);
      return true;
    },
    remove: (key: string): void => {
      values.delete(key);
    },
  };
}

void test('the chosen hero is kept on the device, and a kept id the game does not know is ignored', (): void => {
  const store: KeyValueStore = memory();
  assert.equal(readHero(store, content), null);
  keepHero(store, 'woman');
  assert.equal(store.read(HERO_KEY), 'woman');
  assert.equal(readHero(store, content), 'woman');
  keepHero(store, 'nobody');
  assert.equal(readHero(store, content), null);
});

const OPEN: HeroStanding = { level: 1, xp: 0, equipped: emptyEquipment() };

const OPTIONS: readonly HeroOption[] = [
  { id: 'man', name: 'Man', finds: 'Rusted Blade' },
  { id: 'woman', name: 'Woman', finds: 'Worn Crossbow' },
  { id: 'wight_man', name: 'Wight man', finds: 'Rusted Blade' },
  { id: 'wight_woman', name: 'Wight woman', finds: 'Worn Crossbow' },
];

void test('a new character starts with no hero picked, every hero offered with the weapon each finds, and Enter waits for a pick', (): void => {
  const fresh: HeroChoice | null = heroChoice(content, { standing: OPEN, chosen: null, entered: false });
  assert.deepEqual(fresh, { kind: 'choose', options: OPTIONS, chosen: null });
  assert.equal(canEnter(fresh), false);
  assert.equal(heroNote(fresh), HERO_TEXT.pick);
  assert.equal(shownHero(fresh, null), null);
  assert.equal(shownHero(fresh, 'woman'), 'woman');
  assert.equal(shownHero(fresh, 'nobody'), null);
  assert.equal(startingHero(content, null, null), null);
});

void test('picking a hero allows Enter and says the pick can change until then, and changing mind is allowed', (): void => {
  const woman: HeroChoice | null = heroChoice(content, { standing: OPEN, chosen: 'woman', entered: false });
  assert.deepEqual(woman, { kind: 'choose', options: OPTIONS, chosen: 'woman' });
  assert.equal(canEnter(woman), true);
  assert.equal(heroNote(woman), HERO_TEXT.change);
  assert.equal(shownHero(woman, null), 'woman');
  assert.equal(shownHero(woman, 'man'), 'man');
  const man: HeroChoice | null = heroChoice(content, { standing: OPEN, chosen: 'man', entered: false });
  assert.deepEqual(man, { kind: 'choose', options: OPTIONS, chosen: 'man' });
  assert.equal(heroChoice(content, { standing: OPEN, chosen: 'nobody', entered: false })?.kind, 'choose');
  assert.equal(canEnter(heroChoice(content, { standing: OPEN, chosen: 'nobody', entered: false })), false);
  assert.equal(startingHero(content, null, 'woman'), 'woman');
});

void test('once the character has entered the storm the hero is a fact, not a choice, and nothing previews over it', (): void => {
  const entered: HeroChoice | null = heroChoice(content, { standing: OPEN, chosen: 'woman', entered: true });
  assert.deepEqual(entered, { kind: 'fixed', id: 'woman', name: 'Woman' });
  assert.equal(canEnter(entered), true);
  assert.equal(heroNote(entered), null);
  assert.equal(shownHero(entered, 'man'), 'woman');
  assert.equal(heroLocked({ standing: OPEN, chosen: 'woman', entered: true }), true);
  assert.equal(heroLocked({ standing: OPEN, chosen: 'woman', entered: false }), false);
  assert.equal(startingHero(content, 'woman', 'man'), 'woman');
});

void test('a weapon in hand or a level gained locks the hero even before the lobby has seen an entry', (): void => {
  const armed: HeroStanding = { ...OPEN, equipped: { ...emptyEquipment(), weapon: must(generateItem(content, createRng(1), 5, 1, 'rusted_blade', 'common'), 'blade') } };
  assert.deepEqual(heroChoice(content, { standing: armed, chosen: 'man', entered: false }), { kind: 'fixed', id: 'man', name: 'Man' });
  assert.deepEqual(heroChoice(content, { standing: { ...OPEN, level: 2 }, chosen: 'woman', entered: false }), { kind: 'fixed', id: 'woman', name: 'Woman' });
});

void test('with a single hero there is nothing to choose, Enter is open, and that hero is taken from the start', (): void => {
  const single: Content = { ...content, player: { ...content.player, heroes: content.player.heroes.slice(0, 1) } };
  assert.equal(heroChoice(single, { standing: OPEN, chosen: null, entered: false }), null);
  assert.equal(canEnter(null), true);
  assert.equal(startingHero(single, null, null), 'man');
});

void test('names suit the hero once one is picked, and are drawn for either until then', (): void => {
  assert.equal(nameBodyOf(content, null), null);
  assert.equal(nameBodyOf(content, 'woman'), 'woman');
  assert.equal(nameBodyOf(content, 'man'), 'man');
});

void test('the same hero choice is the same, and a different pick, option or kind is not', (): void => {
  const options: readonly HeroOption[] = [
    { id: 'man', name: 'Man', finds: 'Rusted Blade' },
    { id: 'woman', name: 'Woman', finds: null },
  ];
  const open: HeroChoice = { kind: 'choose', options, chosen: null };
  assert.equal(sameHeroChoice(null, null), true);
  assert.equal(sameHeroChoice(open, { kind: 'choose', options: options.map((option: HeroOption): HeroOption => ({ ...option })), chosen: null }), true);
  assert.equal(sameHeroChoice(null, open), false);
  assert.equal(sameHeroChoice(open, null), false);
  assert.equal(sameHeroChoice(open, { ...open, chosen: 'man' }), false);
  assert.equal(sameHeroChoice(open, { ...open, options: options.slice(0, 1) }), false);
  assert.equal(sameHeroChoice(open, { ...open, options: [{ id: 'man', name: 'Man', finds: 'Other' }, ...options.slice(1)] }), false);
  assert.equal(sameHeroChoice(open, { kind: 'fixed', id: 'man', name: 'Man' }), false);
  assert.equal(sameHeroChoice({ kind: 'fixed', id: 'man', name: 'Man' }, { kind: 'fixed', id: 'man', name: 'Man' }), true);
  assert.equal(sameHeroChoice({ kind: 'fixed', id: 'man', name: 'Man' }, { kind: 'fixed', id: 'woman', name: 'Woman' }), false);
});
