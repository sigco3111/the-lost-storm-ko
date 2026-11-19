import type { ReadonlyVec2 } from '../math.ts';
import { directionOf } from '../math.ts';
import { rollsSteady } from './dash.ts';
import { steadied } from './momentum.ts';
import { pushDistance } from './movement.ts';
import { steadiness } from './poise.ts';
import type { Actor } from './types.ts';

export const HERO_PUSH = {
  reelFrom: 0.45,
  sideCos: 0.7,
  reelAnimation: 'hit_reel',
} as const;

export type HitSide = 'front' | 'back' | 'left' | 'right';

export type HeroReaction = 'none' | 'flinch' | 'reel';

export interface HeroPush {
  readonly reaction: HeroReaction;
  readonly side: HitSide | null;
  readonly travel: number;
}

const UNMOVED: HeroPush = { reaction: 'none', side: null, travel: 0 };

export function hitSide(push: ReadonlyVec2, facing: number): HitSide | null {
  const length: number = Math.hypot(push.x, push.z);
  if (length <= 0) return null;
  const ahead: ReadonlyVec2 = directionOf(facing);
  const along: number = (push.x * ahead.x + push.z * ahead.z) / length;
  const across: number = (push.x * ahead.z - push.z * ahead.x) / length;
  if (along <= -HERO_PUSH.sideCos) return 'front';
  if (along >= HERO_PUSH.sideCos) return 'back';
  return across > 0 ? 'left' : 'right';
}

export function heroPush(push: ReadonlyVec2, facing: number): HeroPush {
  const side: HitSide | null = hitSide(push, facing);
  if (side === null) return UNMOVED;
  const travel: number = pushDistance({ x: push.x, z: push.z });
  return { reaction: travel >= HERO_PUSH.reelFrom ? 'reel' : 'flinch', side, travel };
}

export function pushOnHero(hero: Actor, knockback: number, direction: ReadonlyVec2): HeroPush {
  if (knockback <= 0 || steadied(hero) || rollsSteady(hero)) return UNMOVED;
  const scale: number = knockback * steadiness(hero);
  return heroPush({ x: direction.x * scale, z: direction.z * scale }, hero.facing);
}

export function reelAnimation(side: HitSide): string {
  return `${HERO_PUSH.reelAnimation}_${side}`;
}
