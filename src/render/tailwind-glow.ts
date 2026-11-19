import type { Color, Scene } from 'three';
import type { TailwindTier } from '../../sim/content/tailwind-types.ts';
import type { World, WorldEvent } from '../../sim/world/types.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import type { BurstOptions } from './particles.ts';
import { fallLook, glowTarget, killSparks, riseLook, stepGlow, TAILWIND_FEEL } from './tailwind-feel.ts';
import type { FallLook, RiseLook } from './tailwind-feel.ts';
import { floorUp } from './terrain-lift.ts';

const GLOW_LOOK = {
  lightHeight: 1.6,
  fill: 0.55,
  band: 0,
  width: 0.8,
  wobble: 0.08,
  lift: 0.02,
} as const;

const RISE_SPRAY: Partial<BurstOptions> = { speed: { min: 1, max: 4.5 }, lift: { min: 2, max: 6 }, life: { min: 0.5, max: 1.1 }, size: { min: 0.2, max: 0.5 }, gravity: -1.5, drag: 1.6, jitter: 1.2 };
const KILL_SPRAY: Partial<BurstOptions> = { speed: { min: 0.5, max: 2 }, lift: { min: 2, max: 5 }, life: { min: 0.4, max: 0.8 }, size: { min: 0.2, max: 0.4 }, gravity: -2, jitter: 0.5 };
const FALL_SPRAY: Partial<BurstOptions> = { speed: { min: 0.3, max: 1.5 }, lift: { min: 0, max: 1 }, life: { min: 0.8, max: 1.4 }, size: { min: 0.2, max: 0.4 }, gravity: 1.2, drag: 1.4, jitter: 1.2 };

export interface TailwindGlowDeps {
  readonly scene: Scene;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly mark: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
  readonly colorOf: (hex: string) => Color;
  readonly trauma: (amount: number) => void;
  readonly soft: () => boolean;
}

export interface TailwindGlow {
  handle(event: WorldEvent, world: World): void;
  update(dt: number, world: World): void;
  clear(): void;
}

function tierOf(world: World, tier: number): TailwindTier | null {
  return world.content.tailwind.tiers[tier - 1] ?? null;
}

export function createTailwindGlow(deps: TailwindGlowDeps): TailwindGlow {
  let warmth: GroundLight | null = null;
  let strength: number = 0;

  const rise = (world: World, tier: number): void => {
    const def: TailwindTier | null = tierOf(world, tier);
    if (def === null) return;
    const look: RiseLook = riseLook(tier, world.content.tailwind.tiers.length, deps.soft());
    const color: Color = deps.colorOf(def.color);
    const { x, z } = world.player.pos;
    deps.ring(x, z, look.radius, color, look.duration);
    deps.spray(x, 0.4, z, color, look.sparks, RISE_SPRAY);
    deps.flashLight(x, GLOW_LOOK.lightHeight, z, color, look.light);
    if (look.shake > 0) deps.trauma(look.shake);
  };

  const kill = (event: Extract<WorldEvent, { type: 'death' }>, world: World): void => {
    const def: TailwindTier | null = tierOf(world, world.tailwind.tier);
    const count: number = killSparks(world.tailwind.tier, deps.soft());
    if (def === null || count === 0) return;
    deps.spray(event.pos.x, 1, event.pos.z, deps.colorOf(def.color), count, KILL_SPRAY);
  };

  const fall = (event: Extract<WorldEvent, { type: 'tailwind_end' }>, world: World): void => {
    const look: FallLook | null = event.reason === 'fell' ? null : fallLook(event.best, deps.soft());
    const def: TailwindTier | null = tierOf(world, event.best);
    if (look === null || def === null) return;
    const color: Color = deps.colorOf(def.color);
    const { x, z } = world.player.pos;
    deps.mark(x, z, look.radius, color, look.duration);
    deps.spray(x, 1.6, z, color, look.sparks, FALL_SPRAY);
  };

  return {
    handle(event: WorldEvent, world: World): void {
      if (event.type === 'death' && event.team === 'monster') kill(event, world);
      else if (event.type === 'tailwind_rise') rise(world, event.tier);
      else if (event.type === 'tailwind_end') fall(event, world);
    },
    update(dt: number, world: World): void {
      const tiers: readonly TailwindTier[] = world.content.tailwind.tiers;
      strength = stepGlow(strength, glowTarget(world.tailwind.tier, tiers.length, deps.soft()), dt);
      const top: TailwindTier | undefined = tiers[tiers.length - 1];
      if (warmth === null) {
        if (strength <= 0 || top === undefined) return;
        const radius: number = TAILWIND_FEEL.glowRadius;
        warmth = createGroundLight(deps.colorOf(top.color), { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: GLOW_LOOK.fill, band: GLOW_LOOK.band, width: radius * GLOW_LOOK.width, wobble: radius * GLOW_LOOK.wobble });
        deps.scene.add(warmth.mesh);
      }
      const { x, z } = world.player.pos;
      warmth.mesh.position.set(x, floorUp(x, GROUND_LIGHT.height + GLOW_LOOK.lift, z), z);
      warmth.mesh.visible = strength > 0;
      warmth.pose(strength, world.time);
    },
    clear(): void {
      strength = 0;
      if (warmth !== null) warmth.mesh.visible = false;
    },
  };
}
