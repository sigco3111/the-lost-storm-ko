import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, ARENA_CONTENT, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { Content, MonsterDef, SkillDef, SurfaceDef } from '../content/types.ts';
import { burnTicks } from './combat.ts';
import { heatAt, stepHeat } from './heat.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const STEP: number = 1 / 60;
const fire: SkillDef = must(ARENA_CONTENT.skills.get('fire_burst'), 'fire_burst');
const scorch: SkillDef = { ...fire, id: 'test_scorch', burn: { duration: 1, tick: 0.25, share: 0.1 } };
const floor: SurfaceDef = must(ARENA_CONTENT.surfaces.get('cave_floor'), 'cave_floor');
const vent: SurfaceDef = { ...floor, id: 'test_vent', heat: { skill: 'test_scorch', lifeShare: 0.4 } };
const shambler: MonsterDef = must(ARENA_CONTENT.monsters.get('test_shambler'), 'test_shambler');
const HEAT_CONTENT: Content = {
  ...ARENA_CONTENT,
  monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, ['test_native', { ...shambler, id: 'test_native', heatproof: true }]]),
  skills: new Map<string, SkillDef>([...ARENA_CONTENT.skills, [scorch.id, scorch]]),
  surfaces: new Map<string, SurfaceDef>([...ARENA_CONTENT.surfaces, [vent.id, vent], [floor.id, floor]]),
};

function heatedArena(hot: boolean): World {
  const world: World = arena(3, HEAT_CONTENT);
  const tile: string = must(Object.keys(world.zone.floors)[0], 'floor tile');
  world.zone = { ...world.zone, floors: { ...world.zone.floors, [tile]: hot ? vent.id : floor.id } };
  return world;
}

function burnDamage(events: readonly WorldEvent[], targetId: number): number {
  return events.reduce((sum: number, event: WorldEvent): number => (event.type === 'damage' && event.targetId === targetId && event.burn ? sum + event.amount : sum), 0);
}

function stand(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / STEP); step += 1) events.push(...stepWorld(world, [], STEP));
  return events;
}

void test('a tile whose surface has heat reports it, and a plain tile reports none', (): void => {
  assert.deepEqual(heatAt(heatedArena(true), ARENA_CENTRE.x, ARENA_CENTRE.z), vent.heat);
  assert.equal(heatAt(heatedArena(false), ARENA_CENTRE.x, ARENA_CENTRE.z), null);
});

void test('standing on hot ground sets the hero alight with the surface skill, a share of their life on every tick', (): void => {
  const world: World = heatedArena(true);
  world.player.life = world.player.maxLife;
  stepHeat(world);
  const burn = must(world.player.burn, 'hero burning');
  assert.equal(burn.source, scorch.id);
  assert.equal(burn.perTick, Math.max(1, Math.round(world.player.maxLife * 0.4 * 0.1)));
  assert.equal(burn.ticksLeft, burnTicks(scorch));
});

void test('the hero keeps burning while they stand on the heat, and it fades a little after they leave', (): void => {
  const world: World = heatedArena(true);
  world.player.maxLife = 10000;
  world.player.life = 10000;
  world.player.invulnerable = 0;
  const perTick: number = Math.round(10000 * 0.4 * 0.1);
  const held: number = burnDamage(stand(world, 2), world.player.id) / perTick;
  assert.ok(held >= 7 && held <= 8, `${held} ticks in two seconds`);
  world.zone = { ...world.zone, floors: Object.fromEntries(Object.keys(world.zone.floors).map((tile: string): [string, string] => [tile, floor.id])) };
  const after: number = burnDamage(stand(world, 2), world.player.id);
  assert.ok(after > 0 && after <= perTick * burnTicks(scorch));
  assert.equal(world.player.burn, null);
});

void test('a heatproof monster stands in the heat unharmed while an ordinary one burns', (): void => {
  const world: World = heatedArena(true);
  const native: MonsterState = place(world, 'test_native', { x: ARENA_CENTRE.x + 3, z: ARENA_CENTRE.z });
  const stranger: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x - 3, z: ARENA_CENTRE.z });
  stepHeat(world);
  assert.equal(native.burn, null);
  assert.equal(must(stranger.burn, 'stranger burning').source, scorch.id);
});

void test('nothing burns on plain ground', (): void => {
  const world: World = heatedArena(false);
  stepHeat(world);
  assert.equal(world.player.burn, null);
});
