import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { glidesWith, momentumShare, steadied } from '../../sim/world/momentum.ts';
import { channelInterval, spunSkill } from '../../sim/world/skills.ts';
import type { ActionState, PlayerState } from '../../sim/world/types.ts';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';

export const SPIN_MOTION = {
  fullTurn: Math.PI * 2,
  wakeEvery: 1.1,
  restReach: 3,
  settled: 0.002,
} as const;

export interface SpinRead {
  readonly spinning: boolean;
  readonly turnSpeed: number;
  readonly turned: number;
  readonly share: number;
  readonly steady: boolean;
  readonly reach: number;
  readonly animation: string | null;
}

export interface SpinMotion {
  angle: number;
  readonly speed: Spring;
  readonly share: Spring;
  readonly reach: Spring;
  readonly steady: Spring;
  travelled: number;
  last: Vec2 | null;
  mark: Vec2 | null;
  animation: string | null;
}

export function createSpinMotion(): SpinMotion {
  return {
    angle: 0,
    speed: { value: 0, velocity: 0, target: 0 },
    share: { value: 0, velocity: 0, target: 0 },
    reach: { value: SPIN_MOTION.restReach, velocity: 0, target: SPIN_MOTION.restReach },
    steady: { value: 0, velocity: 0, target: 0 },
    travelled: 0,
    last: null,
    mark: null,
    animation: null,
  };
}

function reachOf(skill: SkillDef): number {
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'nova':
      return delivery.radius;
    case 'arc':
      return delivery.reach;
    case 'projectile':
    case 'dash':
    case 'mark':
    case 'revive':
    case 'field':
    case 'chain':
    case 'area':
    case 'blink':
    case 'beam':
      return SPIN_MOTION.restReach;
  }
  return SPIN_MOTION.restReach;
}

export function readSpin(player: PlayerState): SpinRead {
  const action: ActionState | null = player.action;
  const press = action?.skill.press ?? null;
  const share: number = momentumShare(player);
  const steady: boolean = steadied(player);
  if (action === null || press?.type !== 'channel' || !glidesWith(press) || action.phase === 'recovery') {
    return { spinning: false, turnSpeed: 0, turned: 0, share, steady, reach: SPIN_MOTION.restReach, animation: null };
  }
  const interval: number = channelInterval(player, action.skill, press.interval);
  return { spinning: true, turnSpeed: SPIN_MOTION.fullTurn / interval, turned: action.turned, share, steady, reach: reachOf(spunSkill(player, action.skill)), animation: action.skill.animation };
}

export interface WakeDrop {
  readonly from: Vec2;
  readonly to: Vec2;
}

export function stepSpinMotion(motion: SpinMotion, read: SpinRead, at: Vec2, dt: number): WakeDrop | null {
  springTo(motion.speed, read.spinning ? read.turnSpeed : 0);
  springTo(motion.share, read.share);
  springTo(motion.steady, read.steady ? 1 : 0);
  if (read.spinning) springTo(motion.reach, read.reach);
  stepSpring(motion.speed, dt);
  stepSpring(motion.share, dt);
  stepSpring(motion.steady, dt);
  stepSpring(motion.reach, dt);
  motion.animation = read.spinning ? read.animation : null;
  motion.angle = read.spinning ? read.turned : 0;
  const last: Vec2 | null = motion.last;
  motion.last = { x: at.x, z: at.z };
  if (!read.spinning || last === null || motion.mark === null) {
    motion.travelled = 0;
    motion.mark = read.spinning ? { x: at.x, z: at.z } : null;
    return null;
  }
  motion.travelled += Math.hypot(at.x - last.x, at.z - last.z);
  if (motion.travelled < SPIN_MOTION.wakeEvery) return null;
  const from: Vec2 = motion.mark;
  motion.travelled = 0;
  motion.mark = { x: at.x, z: at.z };
  return { from, to: { x: at.x, z: at.z } };
}

export function spinShown(motion: SpinMotion): number {
  const turning: number = Math.min(1, Math.max(0, motion.speed.value) / SPIN_MOTION.fullTurn);
  return turning > SPIN_MOTION.settled ? turning : 0;
}
