import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BodyChoice, RigLike } from './body-choice.ts';
import { bodyArrived, chooseBody } from './body-choice.ts';

function rig(id: string, frame: string): RigLike {
  return { def: { id, frame } };
}

const HERO: RigLike = rig('hero_woman', 'woman');
const TAKER: RigLike = rig('unfinished_taker', 'woman');
const SPIDER: RigLike = rig('spider', 'spider');

function rigs(...loaded: readonly RigLike[]): Map<string, RigLike> {
  return new Map<string, RigLike>(loaded.map((entry: RigLike): [string, RigLike] => [entry.def.id, entry]));
}

void test('a monster whose rig is loaded is drawn on its own rig', (): void => {
  const thrower: RigLike = rig('unfinished_thrower', 'woman');
  assert.deepEqual(chooseBody(rigs(HERO, thrower), 'unfinished_thrower', 'woman', HERO.def.id), { kind: 'own', rig: thrower });
});

void test('a monster whose rig has not loaded is drawn on a loaded rig of the same frame, which names the late rig', (): void => {
  const choice: BodyChoice<RigLike> = chooseBody(rigs(SPIDER, TAKER), 'unfinished_thrower', 'woman', HERO.def.id);
  assert.deepEqual(choice, { kind: 'stand_in', rig: TAKER, late: 'unfinished_thrower' });
});

void test('with no loaded rig of its frame a late monster stands in on the hero\'s rig', (): void => {
  assert.deepEqual(chooseBody(rigs(HERO, TAKER), 'wolf', 'wolf', HERO.def.id), { kind: 'stand_in', rig: HERO, late: 'wolf' });
  assert.deepEqual(chooseBody(rigs(HERO), 'ghost', null, HERO.def.id), { kind: 'stand_in', rig: HERO, late: 'ghost' });
});

void test('only an empty library leaves a monster without any body', (): void => {
  assert.deepEqual(chooseBody(rigs(), 'unfinished_thrower', 'woman', HERO.def.id), { kind: 'none' });
});

void test('a stand-in is replaced once its own rig arrives, and a partly dressed body once everything it lacked is in', (): void => {
  assert.equal(bodyArrived({ standIn: true, partial: true }, false, []), false);
  assert.equal(bodyArrived({ standIn: true, partial: true }, true, ['torn_hood']), true);
  assert.equal(bodyArrived({ standIn: false, partial: true }, true, ['torn_hood']), false);
  assert.equal(bodyArrived({ standIn: false, partial: true }, true, []), true);
  assert.equal(bodyArrived({ standIn: false, partial: false }, true, []), false);
});
