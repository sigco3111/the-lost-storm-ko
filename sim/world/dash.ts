import type { DashDelivery } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import { isWalkable, moveWithCollision, paceAt } from '../nav/grid.ts';
import type { ActionState, ActorState } from './types.ts';

export const DASH = {
  step: 0.2,
  aimDeadZone: 0.3,
  clearStep: 0.15,
  clearReach: 2.4,
  clearHeadings: 16,
  clearGap: 0.02,
} as const;

export interface Body {
  readonly pos: ReadonlyVec2;
  readonly radius: number;
}

export function dashOf(action: ActionState | null): DashDelivery | null {
  if (action === null || action.skill.delivery.type !== 'dash') return null;
  return action.skill.delivery;
}

export function isDashing(actor: ActorState): boolean {
  return actor.action !== null && actor.action.phase === 'windup' && dashOf(actor.action) !== null;
}

export function isInvulnerable(actor: ActorState): boolean {
  const action: ActionState | null = actor.action;
  const dash: DashDelivery | null = dashOf(action);
  if (action === null || dash === null || action.phase !== 'windup') return false;
  return action.windup - action.timeLeft < dash.invulnerable;
}

export function passesThrough(actor: ActorState): boolean {
  const action: ActionState | null = actor.action;
  if (action !== null && action.skill.press?.type === 'channel') return action.skill.press.passThrough;
  return isDashing(actor) && (dashOf(action)?.passThrough ?? false);
}

export function rollsSteady(actor: ActorState): boolean {
  return isDashing(actor) && (dashOf(actor.action)?.steady ?? false);
}

function clearAt(grid: NavGrid, at: ReadonlyVec2, radius: number, crowd: readonly Body[]): boolean {
  if (!isWalkable(grid, at.x, at.z)) return false;
  return crowd.every((other: Body): boolean => Math.hypot(other.pos.x - at.x, other.pos.z - at.z) >= radius + other.radius + DASH.clearGap);
}

export function clearSpot(grid: NavGrid, from: ReadonlyVec2, heading: ReadonlyVec2, radius: number, crowd: readonly Body[]): Vec2 | null {
  if (clearAt(grid, from, radius, crowd)) return { x: from.x, z: from.z };
  for (let reach: number = DASH.clearStep; reach <= DASH.clearReach + 1e-9; reach += DASH.clearStep) {
    const ahead: Vec2 = { x: from.x + heading.x * reach, z: from.z + heading.z * reach };
    if (clearAt(grid, ahead, radius, crowd)) return ahead;
    for (let turn: number = 1; turn < DASH.clearHeadings; turn += 1) {
      const angle: number = Math.atan2(heading.x, heading.z) + (Math.PI * 2 * Math.ceil(turn / 2) * (turn % 2 === 0 ? -1 : 1)) / DASH.clearHeadings;
      const around: Vec2 = { x: from.x + Math.sin(angle) * reach, z: from.z + Math.cos(angle) * reach };
      if (clearAt(grid, around, radius, crowd)) return around;
    }
  }
  return null;
}

export function canDash(actor: ActorState): boolean {
  return actor.alive && actor.stagger <= 0;
}

export function dashAim(actor: ActorState, aim: Vec2, path: readonly Vec2[]): Vec2 {
  if (Math.hypot(aim.x - actor.pos.x, aim.z - actor.pos.z) > DASH.aimDeadZone) return aim;
  return path[0] ?? aim;
}

export function stepDash(grid: NavGrid, actor: ActorState, action: ActionState, dt: number): void {
  const dash: DashDelivery | null = dashOf(action);
  if (dash === null || action.phase !== 'windup' || action.windup <= 0) return;
  if (dash.steady) {
    actor.knock.x = 0;
    actor.knock.z = 0;
  }
  let travel: number = (dash.distance * paceAt(grid, actor.pos.x, actor.pos.z) * Math.min(dt, Math.max(0, action.timeLeft))) / action.windup;
  while (travel > 0) {
    const step: number = Math.min(travel, DASH.step);
    travel -= step;
    moveWithCollision(grid, actor.pos, action.direction.x * step, action.direction.z * step);
    actor.motion = 'dash';
  }
}
