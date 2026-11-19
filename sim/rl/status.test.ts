import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { dummy, offset, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import type { SkillDef } from '../content/types.ts';
import { placeArea } from '../world/areas.ts';
import { burnTicks, ignite, offenceOf, setTempo } from '../world/combat.ts';
import type { MonsterState, World } from '../world/types.ts';
import { RL } from './contract.ts';
import { branded, burning, slowed, statusesOf, targetedBy, targetingHero, weakened } from './status.ts';

const HIT = { amount: 200, tempo: 0.6, slowFor: 2, brandLeft: 3 } as const;

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

void test('an untouched foe reads no status at all', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  assert.deepEqual(statusesOf(world, foe), { burning: 0, branded: 0, slowed: 0, weakened: 0 });
});

void test('a burning foe reads the burn still to come as a share of its life', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  const fire: SkillDef = shapeSkill('fire_burst');
  ignite(world, offenceOf(world.player), foe, fire, HIT.amount);
  const share: number = must(fire.burn, 'fire burn').share;
  near(burning(foe), (Math.max(1, Math.round(HIT.amount * share)) * burnTicks(fire)) / foe.maxLife);
});

void test('a slowed foe reads how much slower it is, only while the slow lasts', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  setTempo(foe, HIT.tempo, HIT.slowFor);
  near(slowed(foe), 1 - HIT.tempo);
  foe.tempoTime = 0;
  assert.equal(slowed(foe), 0);
});

void test('a branded foe reads the brand time left', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  foe.brand = { source: 'test', burst: shapeSkill('fire_burst'), offence: offenceOf(world.player), timeLeft: HIT.brandLeft };
  near(branded(foe), HIT.brandLeft / RL.timeScale);
});

void test('a foe standing in the hero shadow reads how much weaker its blows are', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  const umbra: SkillDef = shapeSkill('umbra');
  must(placeArea(world, offenceOf(world.player), umbra, foe.pos), 'the shadow');
  near(weakened(world, foe), umbra.delivery.type === 'area' ? umbra.delivery.weaken : 0);
  assert.equal(weakened(world, world.player), 0);
});

void test('a roused foe targets the hero, and falls back to the hero when its held foe cannot be struck or has died', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  const kin: MonsterState = dummy(world, offset(4, 0));
  assert.equal(targetingHero(world, foe, world.player), false);
  foe.aggro = true;
  assert.equal(targetingHero(world, foe, world.player), true);
  assert.equal(targetedBy(world, world.player), 1);
  foe.foeId = kin.id;
  assert.equal(targetingHero(world, foe, world.player), true);
  assert.equal(foe.foeId, kin.id);
  kin.alive = false;
  assert.equal(targetingHero(world, foe, world.player), true);
  foe.alive = false;
  assert.equal(targetingHero(world, foe, world.player), false);
});
