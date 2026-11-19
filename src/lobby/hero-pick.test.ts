import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { heroRig } from '../../sim/hero.ts';
import type { HeroStanding } from '../../sim/hero.ts';
import { emptyEquipment } from '../../sim/items.ts';
import { createHeroPick } from './hero-pick.ts';
import type { HeroPick } from './hero-pick.ts';

const content: Content = loadContent();

interface Probe {
  readonly pick: HeroPick;
  readonly kept: string[];
  readonly loaded: string[];
  restaged: number;
  entered: boolean;
}

function probe(chosen: string | null): Probe {
  const standing: HeroStanding = { level: 1, xp: 0, equipped: emptyEquipment() };
  const made: Probe = {
    kept: [],
    loaded: [],
    restaged: 0,
    entered: false,
    pick: createHeroPick({
      content,
      chosen,
      standing: (): HeroStanding => standing,
      entered: (): boolean => made.entered,
      load: (id: string): Promise<void> => {
        made.loaded.push(id);
        return Promise.resolve();
      },
      keep: (id: string): void => void made.kept.push(id),
      restage: (): void => {
        made.restaged += 1;
      },
      settled: (): Promise<void> => Promise.resolve(),
    }),
  };
  return made;
}

void test('a new character stands veiled until a hero is previewed or picked, and the pick is kept and shown', async (): Promise<void> => {
  const made: Probe = probe(null);
  assert.equal(made.pick.look().veiled, true);
  assert.equal(made.pick.body(), null);
  await made.pick.preview('woman');
  assert.deepEqual(made.pick.look(), { equipped: emptyEquipment(), rig: heroRig(content, 'woman'), veiled: false });
  await made.pick.preview(null);
  assert.equal(made.pick.look().veiled, true);
  await made.pick.choose('woman');
  assert.equal(made.pick.chosen, 'woman');
  assert.deepEqual(made.kept, ['woman']);
  assert.equal(made.pick.body(), 'woman');
  assert.equal(made.pick.look().rig, heroRig(content, 'woman'));
  await made.pick.choose('man');
  assert.deepEqual(made.kept, ['woman', 'man']);
  assert.ok(made.restaged > 0);
});

void test('after the first entry neither a pick nor a preview changes who woke', async (): Promise<void> => {
  const made: Probe = probe('woman');
  made.entered = true;
  await made.pick.choose('man');
  await made.pick.preview('man');
  assert.equal(made.pick.chosen, 'woman');
  assert.deepEqual(made.kept, []);
  assert.deepEqual(made.loaded, []);
  assert.equal(made.pick.look().rig, heroRig(content, 'woman'));
  assert.deepEqual(made.pick.choice(), { kind: 'fixed', id: 'woman', name: 'Woman' });
});
