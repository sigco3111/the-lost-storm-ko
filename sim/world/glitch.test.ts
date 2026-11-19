import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { finishQuests, must } from '../../test/support.ts';
import type { GlitchDef, GlitchKind } from '../content/glitches.ts';
import { loadContent } from '../content/content.ts';
import { loadGlitches } from '../content/glitches.ts';
import type { Content } from '../content/types.ts';
import { readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { glitchBlock, requestGlitch, setGlitchesEnabled, stepGlitch, storyProgress } from './glitch.ts';
import { attacksHeld } from './glitch-hold.ts';
import type { GlitchRequest } from './glitch-types.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;
const MINUTES: number = 20;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

function combat(kind: GlitchKind): GlitchRequest {
  return { kind, source: 'combat', trigger: null };
}

function fight(seed: number): { readonly world: World; readonly thrall: MonsterState } {
  const world: World = arena(seed);
  const thrall: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 1.4, z: ARENA_CENTRE.z });
  return { world, thrall };
}

function keepFighting(world: World): void {
  for (const monster of world.monsters) {
    monster.alive = true;
    monster.aggro = true;
  }
}

function glitchOnly(world: World, seconds: number, tick: number, between: (world: World) => void = (): void => undefined): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / tick); step += 1) {
    between(world);
    world.events = [];
    world.time += tick;
    stepGlitch(world, tick);
    events.push(...world.events);
  }
  return events;
}

function harmlessFight(seed: number, progress: number, glitches?: GlitchDef): World {
  const world: World = glitches === undefined ? arena(seed) : createWorld(content, { seed, save: null, glitches });
  if (glitches === undefined) place(world, 'mended', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z });
  world.glitch.progress = progress;
  return world;
}

void test('monster attacks wait out the glitch and its grace, then resume', (): void => {
  const { world, thrall } = fight(2);
  requestGlitch(world, 'stutter', 'debug');
  const first: WorldEvent[] = stepWorld(world, [], DT);
  assert.equal(ofType(first, 'glitch_start')[0]?.kind, 'stutter');
  const held: number = world.glitch.def.stutter + world.glitch.def.rules.grace;
  const during: WorldEvent[] = run(world, held - DT * 2);
  assert.equal(ofType(during, 'skill_start').filter((event): boolean => event.actorId === thrall.id).length, 0);
  assert.equal(attacksHeld(world), true);
  const after: WorldEvent[] = run(world, 3);
  assert.equal(attacksHeld(world), false);
  assert.ok(ofType(after, 'skill_start').some((event): boolean => event.actorId === thrall.id));
});

void test('a stutter ends on its own after its length from data', (): void => {
  const world: World = harmlessFight(9, 0);
  world.monsters = [];
  requestGlitch(world, 'stutter', 'debug');
  const events: WorldEvent[] = glitchOnly(world, world.glitch.def.stutter + DT * 3, DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.duration, world.glitch.def.stutter);
  assert.deepEqual(ofType(events, 'glitch_end'), [{ type: 'glitch_end', kind: 'stutter' }]);
  assert.equal(world.glitch.active, null);
});

void test('a glitch waits while the hero is below the life threshold or a lethal blow is winding up', (): void => {
  const { world, thrall } = fight(3);
  world.player.life = world.player.maxLife * world.glitch.def.rules.minLifeFraction * 0.9;
  assert.equal(glitchBlock(world, combat('stutter')), 'low_life');
  world.player.life = world.player.maxLife;
  for (let step: number = 0; step < 200 && thrall.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(thrall.action?.phase, 'windup');
  assert.equal(glitchBlock(world, combat('stutter')), null);
  world.player.life = thrall.damageMax;
  assert.equal(glitchBlock(world, combat('stutter')), 'telegraph');
  requestGlitch(world, 'stutter', 'debug');
  assert.equal(ofType(stepWorld(world, [], 0), 'glitch_start').length, 0);
  assert.equal(world.glitch.requests.length, 1);
});

void test('a boss winding up any blow holds every glitch back, even at full life', (): void => {
  const boss: string = must([...content.monsters.values()].find((def): boolean => def.boss !== null), 'a boss').id;
  const world: World = arena(4);
  const monster: MonsterState = place(world, boss, { x: ARENA_CENTRE.x + 1.6, z: ARENA_CENTRE.z });
  world.player.invulnerable = 60;
  for (let step: number = 0; step < 600 && monster.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(monster.action?.phase, 'windup');
  world.player.life = world.player.maxLife;
  assert.equal(glitchBlock(world, combat('stutter')), 'telegraph');
});

void test('two glitches never come within the cooldown, but a debug request may', (): void => {
  const world: World = harmlessFight(5, 0);
  world.glitch.requests.push(combat('stutter'));
  glitchOnly(world, world.glitch.def.stutter + DT * 3, DT);
  assert.equal(world.glitch.active, null);
  assert.equal(glitchBlock(world, combat('stutter')), 'cooldown');
  assert.equal(glitchBlock(world, { kind: 'stutter', source: 'debug', trigger: null }), null);
  world.time = world.glitch.readyAt;
  assert.equal(glitchBlock(world, combat('stutter')), null);
});

void test('the glitch setting reaches the world as a command', (): void => {
  const world: World = harmlessFight(15, 0);
  stepWorld(world, [{ type: 'glitch_setting', enabled: false }], DT);
  assert.equal(world.glitch.enabled, false);
  stepWorld(world, [{ type: 'glitch_setting', enabled: true }], DT);
  assert.equal(world.glitch.enabled, true);
});

void test('the debug command asks for a glitch through the world step', (): void => {
  const world: World = harmlessFight(13, 0);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'glitch', kind: 'stutter' }], DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.kind, 'stutter');
});

void test('the story decides how often glitches come, and the same seed gives the same glitches', (): void => {
  const early: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 0), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  const late: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 4), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  const again: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 4), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  assert.ok(early.length > 0, `early ${early.length} late ${late.length}`);
  assert.ok(late.length > early.length, `early ${early.length} late ${late.length}`);
  assert.deepEqual(again, late);
});

function world0(): World {
  return createWorld(content, { seed: 1, save: null });
}

const done = (quest: string): { readonly type: 'quest'; readonly quest: string; readonly is: 'done'; readonly not: false } => ({ type: 'quest', quest, is: 'done', not: false });
const STAGED: GlitchDef = {
  ...loadGlitches(),
  progress: [
    { value: 1, when: [done('out_of_the_mist')] },
    { value: 2, when: [done('to_the_waystation')] },
    { value: 4, when: [done('out_of_the_mist'), done('to_the_waystation')] },
  ],
};

function lateWorld(seed: number, save: ReturnType<typeof readSave> = null): World {
  return createWorld(content, { seed, save, glitches: STAGED });
}

void test('story progress comes from quests, never falls, and travels in the save', (): void => {
  const partial: World = lateWorld(1);
  partial.quests = { out_of_the_mist: must(content.quests.get('out_of_the_mist'), 'quest').objectives.length };
  assert.equal(storyProgress(partial), 1);
  partial.quests = { to_the_waystation: must(content.quests.get('to_the_waystation'), 'quest').objectives.length };
  assert.equal(storyProgress(partial), 2);
  const world: World = finishQuests(lateWorld(1));
  assert.equal(storyProgress(world), 4);
  stepWorld(world, [], DT);
  assert.equal(world.glitch.progress, 4);
  world.quests = {};
  assert.equal(storyProgress(world), 4);
  const loaded: World = lateWorld(2, readSave(content, JSON.parse(JSON.stringify(toSave(world)))));
  assert.equal(loaded.glitch.progress, 4);
  const plain: World = finishQuests(world0());
  assert.equal(storyProgress(plain), 1);
});

void test('a story trigger waits for its moment, fires once, and stays fired after a save', (): void => {
  const triggered: GlitchDef = { ...loadGlitches(), triggers: [{ id: 'first_stutter', kind: 'stutter', during: 'calm', when: [done('to_the_waystation')] }] };
  const world: World = harmlessFight(7, 0, triggered);
  place(world, 'mended', { x: world.player.pos.x + 6, z: world.player.pos.z });
  world.quests = { to_the_waystation: must(content.quests.get('to_the_waystation'), 'quest').objectives.length };
  for (const monster of world.monsters) monster.aggro = true;
  assert.equal(ofType(glitchOnly(world, 2, DT), 'glitch_start').length, 0);
  for (const monster of world.monsters) monster.aggro = false;
  const fired: EventOf<'glitch_start'>[] = ofType(glitchOnly(world, DT, DT), 'glitch_start');
  assert.equal(fired[0]?.kind, 'stutter');
  assert.deepEqual(world.glitch.fired, ['first_stutter']);
  const loaded: World = createWorld(content, { seed: 8, save: readSave(content, JSON.parse(JSON.stringify(toSave(world)))), glitches: triggered });
  assert.deepEqual(loaded.glitch.fired, ['first_stutter']);
  glitchOnly(world, 120, 1);
  assert.equal(world.glitch.requests.some((request: GlitchRequest): boolean => request.trigger === 'first_stutter'), false);
});

void test('turned off, nothing fires on its own, but a debug request still does', (): void => {
  const world: World = harmlessFight(11, 4);
  setGlitchesEnabled(world, false);
  assert.equal(ofType(glitchOnly(world, 600, 1, keepFighting), 'glitch_start').length, 0);
  requestGlitch(world, 'stutter', 'debug');
  assert.equal(ofType(glitchOnly(world, DT, DT), 'glitch_start').length, 1);
});

void test('a wrong word arms the next line instead of taking the hero anywhere', (): void => {
  const world: World = harmlessFight(12, 0);
  requestGlitch(world, 'wrong_word', 'debug');
  const events: WorldEvent[] = glitchOnly(world, DT, DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.kind, 'wrong_word');
  assert.notEqual(world.glitch.wrongWord, null);
  assert.equal(world.glitch.active, null);
});
