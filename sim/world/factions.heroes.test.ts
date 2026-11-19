import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { offset, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { placeArea } from './areas.ts';
import { offenceOf, targetsOf } from './combat.ts';
import { mayStrike } from './factions.ts';
import { alliesOf, isAlly } from './heal.ts';
import type { Measurement, Meter } from '../measure.ts';
import { createMeter, readMeter } from '../measure.ts';
import { stepWorld } from './step.ts';
import type { PlayerState, World, WorldEvent } from './types.ts';
import { dealtScale } from './weaken.ts';

const DUEL = { rival: 1, swingSteps: 30, dt: 1 / 30 } as const;

function joined(world: World, at: Vec2, party: number): PlayerState {
  const apart: PlayerState = shapeArena([]).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z }, party };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

function ahead(world: World): Vec2 {
  return { x: world.player.pos.x, z: world.player.pos.z + 1.2 };
}

void test('a hero in another party may be struck, and an ally may not', (): void => {
  const world: World = shapeArena([]);
  const rival: PlayerState = joined(world, offset(2, 0), DUEL.rival);
  const ally: PlayerState = joined(world, offset(-2, 0), 0);
  const side = { sourceId: world.player.id, faction: null } as const;
  assert.equal(mayStrike(world, side, rival), true);
  assert.equal(mayStrike(world, side, ally), false);
  assert.deepEqual(targetsOf(world, side).map((actor): number => actor.id), [rival.id]);
});

void test('a Cleave cuts a rival hero standing in front and leaves an ally there untouched', (): void => {
  for (const party of [DUEL.rival, 0]) {
    const world: World = shapeArena(['cleave']);
    const other: PlayerState = joined(world, ahead(world), party);
    const life: number = other.life;
    stepWorld(world, [{ type: 'skill', slot: 0, aim: other.pos, targetId: null }], DUEL.dt);
    for (let step: number = 1; step < DUEL.swingSteps; step += 1) stepWorld(world, [], DUEL.dt);
    if (party === DUEL.rival) assert.ok(other.life < life, 'the rival was not cut');
    else assert.equal(other.life, life);
  }
});

void test('a rival hero shadow weakens the other hero, and an ally shadow does not', (): void => {
  const world: World = shapeArena([]);
  const rival: PlayerState = joined(world, offset(2, 0), DUEL.rival);
  const ally: PlayerState = joined(world, offset(-2, 0), 0);
  const umbra = shapeSkill('umbra');
  must(placeArea(world, offenceOf(world.player), umbra, rival.pos), 'the shadow on the rival');
  must(placeArea(world, offenceOf(world.player), umbra, ally.pos), 'the shadow on the ally');
  assert.ok(dealtScale(world, rival) < 1);
  assert.equal(dealtScale(world, ally), 1);
  assert.equal(dealtScale(world, world.player), 1);
});

void test('a hero heals its own party and never a rival', (): void => {
  const world: World = shapeArena([]);
  const rival: PlayerState = joined(world, offset(2, 0), DUEL.rival);
  const ally: PlayerState = joined(world, offset(-2, 0), 0);
  const side = { sourceId: world.player.id, faction: null } as const;
  assert.equal(isAlly(world, side, ally), true);
  assert.equal(isAlly(world, side, rival), false);
  assert.deepEqual(alliesOf(world, { sourceId: rival.id, faction: null }).filter((actor): boolean => actor.kind === 'player').map((actor): number => actor.id), [rival.id]);
});

void test('a rival hero who falls is not booked as the primary hero dying', (): void => {
  const world: World = shapeArena(['cleave']);
  const rival: PlayerState = joined(world, ahead(world), DUEL.rival);
  rival.life = 1;
  const xp: number = world.player.xp;
  stepWorld(world, [{ type: 'skill', slot: 0, aim: rival.pos, targetId: null }], DUEL.dt);
  for (let step: number = 1; step < DUEL.swingSteps; step += 1) stepWorld(world, [], DUEL.dt);
  assert.equal(rival.alive, false);
  assert.equal(world.death, null);
  assert.equal(world.player.xp, xp);
});

void test('a rival hero who falls is not measured as the primary hero dying', (): void => {
  const world: World = shapeArena(['cleave']);
  const rival: PlayerState = joined(world, ahead(world), DUEL.rival);
  rival.life = 1;
  const meter: Meter = createMeter(world, []);
  const deaths: Measurement[] = [];
  const watch = (events: readonly WorldEvent[]): void => {
    for (const measurement of readMeter(world, meter, events)) if (measurement.kind === 'death') deaths.push(measurement);
  };
  watch(stepWorld(world, [{ type: 'skill', slot: 0, aim: rival.pos, targetId: null }], DUEL.dt));
  for (let step: number = 1; step < DUEL.swingSteps; step += 1) watch(stepWorld(world, [], DUEL.dt));
  assert.equal(rival.alive, false);
  assert.deepEqual(deaths, []);
});
