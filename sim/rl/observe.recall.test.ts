import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { must } from '../../test/support.ts';
import { dropOnGround } from '../world/ground.ts';
import { HEAT } from '../world/heat.ts';
import { spawnPackNear } from '../world/monsters.ts';
import type { MonsterState, World, WorldEvent } from '../world/types.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import { ENTITY_FEATURES, RL, SELF_FEATURES, SLOT_FEATURES } from './contract.ts';
import type { Observation, Seen, View } from './observe.ts';
import { rememberedFoes, seenMonsters } from './observe.ts';
import { recallEvents } from './recall.ts';

const CONTENT: Content = loadContent();
const SKILL: SkillDef = must(CONTENT.skills.get('cleave'), 'cleave');
const CROWD = { foes: 14, gold: 30, away: 9, moved: 4, later: 0.1 } as const;
function nobody(world: World): View {
  return { hero: world.player, seen: [], targets: [], pickup: null };
}

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

function entityValue(seen: Observation, index: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + index * ENTITY_FEATURES.length + ENTITY_FEATURES.indexOf(name)] ?? Number.NaN;
}

function struck(world: World, sourceId: number, amount: number): WorldEvent {
  return { type: 'damage', targetId: world.player.id, sourceId, targetTeam: 'player', amount, crit: false, killed: false, pos: world.player.pos, direction: { x: 1, z: 0 }, skill: SKILL, burn: false };
}

void test('a recent hit shows as life lost and a fresh hit, and fades with time', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 37, jitter: 0, waves: 1 });
  const world: World = arena.world;
  const foe: MonsterState = must(world.monsters[0], 'a foe');
  assert.equal(selfValue(arenaObservation(arena), 'since_hit'), 1);
  recallEvents(arena.recall, world, world.player, [struck(world, foe.id, world.player.maxLife / 4)]);
  const hurt: Observation = arenaObservation(arena);
  assert.equal(selfValue(hurt, 'life_lost_recent'), 0.25);
  assert.equal(selfValue(hurt, 'since_hit'), 0);
  assert.equal(selfValue(hurt, 'hit_unseen'), 0);
  world.time += RL.recentWindow + CROWD.later;
  const later: Observation = arenaObservation(arena);
  assert.equal(selfValue(later, 'life_lost_recent'), 0);
  assert.ok(Math.abs(selfValue(later, 'since_hit') - (RL.recentWindow + CROWD.later) / RL.timeScale) < 1e-6);
});

void test('a hit from a foe that has since died is not an unseen attacker', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 37, jitter: 0, waves: 1 });
  const foe: MonsterState = must(arena.world.monsters[0], 'a foe');
  recallEvents(arena.recall, arena.world, arena.world.player, [struck(arena.world, foe.id, 5)]);
  foe.alive = false;
  assert.equal(selfValue(arenaObservation(arena), 'hit_unseen'), 0);
});

void test('burning ground is not an unseen attacker', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 37, jitter: 0, waves: 1 });
  recallEvents(arena.recall, arena.world, arena.world.player, [struck(arena.world, HEAT.sourceId, 5)]);
  assert.equal(selfValue(arenaObservation(arena), 'hit_unseen'), 0);
});

void test('a foe that drops out of view is remembered at its last seen spot', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 41, jitter: 0, waves: 1 });
  const world: World = arena.world;
  const kind: MonsterDef = must(arena.pool[0], 'a monster kind');
  const from: Vec2 = world.player.pos;
  spawnPackNear(world, kind.id, CROWD.foes, { x: from.x + CROWD.away, z: from.z }).forEach((monster: MonsterState): void => {
    monster.aggro = true;
  });
  arenaObservation(arena);
  for (let drop: number = 0; drop < CROWD.gold; drop += 1) dropOnGround(world, from, { kind: 'gold', amount: 1 });
  const crowded: Observation = arenaObservation(arena);
  assert.equal(entityValue(crowded, 0, 'remembered'), 0);
  assert.equal(entityValue(crowded, RL.entities, 'present'), 1);
  assert.equal(entityValue(crowded, RL.entities, 'remembered'), 1);
  assert.equal(entityValue(crowded, RL.entities, 'kind_monster'), 1);
  assert.equal(entityValue(crowded, RL.entities, 'hostile'), 1);
  const seen: readonly MonsterState[] = seenMonsters(crowded.view);
  const hidden: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.alive && !seen.includes(monster)), 'a foe out of view');
  recallEvents(arena.recall, world, world.player, [struck(world, hidden.id, 5)]);
  assert.equal(selfValue(arenaObservation(arena), 'hit_unseen'), 1);
});

void test('a remembered foe keeps the spot it was seen at, and is forgotten when dead or long unseen', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 41, jitter: 0, waves: 1 });
  const world: World = arena.world;
  const foe: MonsterState = must(world.monsters[0], 'a foe');
  const seenAt: Vec2 = { x: foe.pos.x, z: foe.pos.z };
  arenaObservation(arena);
  foe.pos = { x: foe.pos.x + CROWD.moved, z: foe.pos.z };
  const remembered: Seen[] = rememberedFoes(world, arena.recall, nobody(world));
  assert.ok(remembered.some((seen: Seen): boolean => seen.type === 'remembered' && seen.pos.x === seenAt.x && seen.pos.z === seenAt.z));
  assert.ok(remembered.length <= RL.remembered);
  foe.alive = false;
  assert.ok(!rememberedFoes(world, arena.recall, nobody(world)).some((seen: Seen): boolean => seen.pos.x === seenAt.x && seen.pos.z === seenAt.z));
  world.time += RL.memoryWindow + CROWD.later;
  assert.deepEqual(rememberedFoes(world, arena.recall, nobody(world)), []);
});
