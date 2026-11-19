import type { UnisonDef } from '../content/combat-types.ts';
import { distance, facingOf } from '../math.ts';
import { lineOfSight } from '../nav/grid.ts';
import type { MonsterState, World } from './types.ts';

export function unisonOf(world: World, monster: MonsterState): UnisonDef | null {
  return world.content.factions.get(monster.def.faction)?.unison ?? null;
}

function faceHero(world: World, monster: MonsterState): void {
  const toward = { x: world.player.pos.x - monster.pos.x, z: world.player.pos.z - monster.pos.z };
  if (Math.hypot(toward.x, toward.z) > 0) monster.facing = facingOf(toward);
}

function kin(monster: MonsterState, other: MonsterState): boolean {
  return other.alive && other.spawnTime <= 0 && other.def.faction === monster.def.faction;
}

export function lookTogether(world: World, seer: MonsterState): void {
  const unison: UnisonDef | null = unisonOf(world, seer);
  if (unison === null || unison.look <= 0 || seer.unison.seen || seer.def.dormant !== null) return;
  const hero = world.player.pos;
  if (distance(seer.pos, hero) > unison.sight) return;
  const group: MonsterState[] = world.monsters.filter((other: MonsterState): boolean => kin(seer, other) && !other.aggro && !other.unison.seen && other.def.dormant === null && distance(other.pos, hero) <= unison.sight && lineOfSight(world.grid, other.pos, hero));
  if (!group.includes(seer) || group.length < unison.gather) return;
  for (const member of group) {
    member.unison.seen = true;
    member.unison.lookUntil = world.time + unison.look;
    faceHero(world, member);
  }
  world.events.push({ type: 'unison_look', monsterIds: group.map((member: MonsterState): number => member.id), turn: unison.turn });
}

export function flinchTogether(world: World, fallen: MonsterState): void {
  const unison: UnisonDef | null = unisonOf(world, fallen);
  if (unison === null || unison.flinch <= 0) return;
  const group: MonsterState[] = world.monsters.filter((other: MonsterState): boolean => other !== fallen && kin(fallen, other) && distance(other.pos, fallen.pos) <= unison.flinchRange);
  if (group.length === 0) return;
  for (const member of group) member.unison.flinchUntil = Math.max(member.unison.flinchUntil, world.time + unison.flinch);
  world.events.push({ type: 'unison_flinch', monsterIds: group.map((member: MonsterState): number => member.id), time: unison.flinch });
}

export function heldInUnison(world: World, monster: MonsterState): boolean {
  if (world.time < monster.unison.flinchUntil) return true;
  if (world.time >= monster.unison.lookUntil) return false;
  faceHero(world, monster);
  return true;
}
