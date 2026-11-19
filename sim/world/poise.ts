import type { RecoveryDef } from '../content/combat-types.ts';
import type { Actor, MonsterState, World } from './types.ts';

export function steadiness(target: Actor): number {
  if (target.kind === 'player') return 1;
  return target.def.boss === null ? target.def.poise.knockback : target.def.boss.poise.knockback;
}

export function pushShare(a: MonsterState, b: MonsterState): number {
  const aGives: boolean = steadiness(a) > 0;
  if (aGives === steadiness(b) > 0) return 0.5;
  return aGives ? 1 : 0;
}

export function heroShare(monster: MonsterState): number {
  return steadiness(monster) > 0 ? 0 : 1;
}

export function recovering(monster: MonsterState): boolean {
  return monster.recovery.guard > 0;
}

export function holdScale(recovery: RecoveryDef, monster: MonsterState): number {
  if (monster.def.boss !== null) return recovery.boss;
  return monster.def.rank !== null || monster.def.mods.length > 0 ? recovery.elite : 1;
}

export function readyIn(monster: MonsterState): number {
  return Math.max(0, ...Object.values(monster.cooldowns));
}

export function afterHold(recovery: RecoveryDef, monster: MonsterState, held: number): void {
  if (held <= 0) return;
  monster.recovery.strain += held;
  const shaken: number = held + recovery.window + recovery.perHeld * monster.recovery.strain;
  monster.recovery.guard = Math.max(monster.recovery.guard, shaken, readyIn(monster) + recovery.window);
}

export function braceThrough(monster: MonsterState, windup: number): void {
  if (recovering(monster)) monster.recovery.guard = Math.max(monster.recovery.guard, windup);
}

export function unbroken(monster: MonsterState): boolean {
  return monster.recovery.unbroken > 0 && monster.action?.phase === 'windup';
}

export function afterInterrupt(recovery: RecoveryDef, monster: MonsterState): void {
  monster.recovery.unbroken = recovery.interruptRest;
}

export function stepRecovery(world: World, monster: MonsterState, dt: number): void {
  monster.recovery.guard = Math.max(0, monster.recovery.guard - dt);
  monster.recovery.unbroken = Math.max(0, monster.recovery.unbroken - dt);
  monster.recovery.stunned = Math.max(0, monster.recovery.stunned - dt);
  monster.recovery.strain = Math.max(0, monster.recovery.strain - world.content.world.recovery.fade * dt);
}
