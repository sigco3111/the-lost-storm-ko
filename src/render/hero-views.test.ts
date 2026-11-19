import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlayerState } from '../../sim/world/types.ts';
import { shapeArena } from '../../test/shape-support.ts';
import type { HeroView, HeroViews } from './hero-views.ts';
import { createHeroViews } from './hero-views.ts';

interface FakeView extends HeroView {
  readonly heroId: number;
  disposed: boolean;
}

function fakeView(hero: PlayerState): FakeView {
  return { heroId: hero.id, disposed: false, dispose(): void {
    this.disposed = true;
  } };
}

void test('every hero but the primary gets one view, made once, and loses it when it leaves', (): void => {
  const world = shapeArena([]);
  const rival: PlayerState = { ...world.player, id: world.nextId, party: 1 };
  world.nextId += 1;
  world.heroes.push(rival);
  let made: number = 0;
  const views: HeroViews<FakeView> = createHeroViews((hero: PlayerState): FakeView => {
    made += 1;
    return fakeView(hero);
  });
  const seen: number[] = [];
  views.each(world, (hero: PlayerState): void => {
    seen.push(hero.id);
  });
  views.each(world, (): void => undefined);
  assert.deepEqual(seen, [rival.id]);
  assert.equal(made, 1);
  assert.equal(views.view(world.player.id), undefined);
  const shown: FakeView | undefined = views.view(rival.id);
  assert.ok(shown !== undefined);
  assert.equal(shown.heroId, rival.id);
  world.heroes.splice(world.heroes.indexOf(rival), 1);
  views.sweep(world);
  assert.equal(shown.disposed, true);
  assert.equal(views.view(rival.id), undefined);
});

void test('a hero whose body has not loaded is asked for again on the next pass', (): void => {
  const world = shapeArena([]);
  const rival: PlayerState = { ...world.player, id: world.nextId, party: 1 };
  world.nextId += 1;
  world.heroes.push(rival);
  let ready: boolean = false;
  const views: HeroViews<FakeView> = createHeroViews((hero: PlayerState): FakeView | null => (ready ? fakeView(hero) : null));
  views.each(world, (): void => undefined);
  assert.equal(views.view(rival.id), undefined);
  ready = true;
  views.each(world, (): void => undefined);
  assert.equal(views.view(rival.id)?.heroId, rival.id);
});
