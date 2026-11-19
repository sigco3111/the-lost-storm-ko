import { pickFoe } from '../world/monsters.ts';
import { dealtScale } from '../world/weaken.ts';
import type { Actor, MonsterState, PlayerState, World } from '../world/types.ts';
import { RL } from './contract.ts';

export interface Statuses {
  readonly burning: number;
  readonly branded: number;
  readonly slowed: number;
  readonly weakened: number;
}

export function burning(actor: Actor): number {
  const burn = actor.burn;
  if (burn === null) return 0;
  return (burn.perTick * burn.ticksLeft) / Math.max(1, actor.maxLife);
}

export function branded(actor: Actor): number {
  return actor.brand === null ? 0 : actor.brand.timeLeft / RL.timeScale;
}

export function slowed(actor: Actor): number {
  return actor.tempoTime > 0 ? 1 - actor.tempo : 0;
}

export function weakened(world: World, actor: Actor): number {
  return 1 - dealtScale(world, actor);
}

export function statusesOf(world: World, actor: Actor): Statuses {
  return { burning: burning(actor), branded: branded(actor), slowed: slowed(actor), weakened: weakened(world, actor) };
}

export function targetingHero(world: World, monster: MonsterState, hero: PlayerState): boolean {
  return monster.alive && monster.aggro && pickFoe(world, monster) === hero;
}

export function targetedBy(world: World, hero: PlayerState): number {
  return world.monsters.filter((monster: MonsterState): boolean => targetingHero(world, monster, hero)).length;
}
