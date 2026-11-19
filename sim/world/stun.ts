import type { RecoveryDef } from '../content/combat-types.ts';
import { afterHold, afterInterrupt } from './poise.ts';
import type { MonsterState, World } from './types.ts';

function elite(monster: MonsterState): boolean {
  return monster.def.rank !== null || monster.def.mods.length > 0;
}

export function stunScale(recovery: RecoveryDef, monster: MonsterState): number {
  if (monster.def.boss !== null) return recovery.stunBoss;
  return elite(monster) ? recovery.stunElite : 1;
}

export function leechScale(recovery: RecoveryDef, monster: MonsterState): number {
  if (monster.def.boss !== null) return recovery.leechBoss;
  return elite(monster) ? recovery.leechElite : 1;
}

export function stunned(monster: MonsterState): boolean {
  return monster.alive && monster.tempo <= 0 && monster.tempoTime > 0;
}

export function stunMonster(world: World, target: MonsterState, seconds: number): number {
  if (!target.alive || seconds <= 0 || target.recovery.stunned > 0) return 0;
  const recovery: RecoveryDef = world.content.world.recovery;
  const time: number = seconds * stunScale(recovery, target);
  if (time <= 0) return 0;
  target.tempo = 0;
  target.tempoTime = Math.max(target.tempoTime, time);
  if (target.def.boss === null && target.action?.phase === 'windup') {
    target.interrupts += 1;
    afterInterrupt(recovery, target);
    target.action = null;
    world.events.push({ type: 'skill_interrupt', actorId: target.id });
  }
  target.recovery.stunned = time + recovery.stunRest;
  afterHold(recovery, target, time);
  world.events.push({ type: 'stun', monsterId: target.id, pos: { x: target.pos.x, z: target.pos.z }, duration: time });
  return time;
}
