import type { Color, Object3D } from 'three';
import { Group } from 'three';
import type { VfxRipple, VfxWave } from '../../sim/content/vfx-types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { facingOf } from '../../sim/math.ts';
import { curveAt } from './gather-orb.ts';
import type { GroundLight, GroundLightForm, GroundLightLook } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import type { BurstOptions } from './particles.ts';
import { floorUp } from './terrain-lift.ts';

export const GHOST_WAVE = {
  height: GROUND_LIGHT.height + 0.03,
  glow: 0.85,
  crest: 3.2,
  cover: 1.35,
  band: 0.1,
  wobble: 0.12,
  grain: 0.55,
  shadeWidth: 0.45,
  shadeGap: 0.4,
  shadeStrength: 0.7,
  rise: 0.06,
  settle: 0.18,
  rippleDim: 0.55,
  hush: 0.4,
  mistSizeMin: 1.6,
  mistSizeMax: 3.2,
  mistTone: 0.05,
  mistLifeMin: 0.55,
  mistLifeMax: 1.1,
  mistLiftMin: 0.15,
  mistLiftMax: 0.6,
  mistHeight: 0.2,
  mistGap: 0.5,
  mistBehind: 0.7,
  mistDrift: 0.06,
  mistCap: 12,
  powerGlow: 0.35,
  crestDrops: 70,
  crestGain: 1.5,
  crestCap: 10,
  crestBehind: 0.35,
  crestHeight: 0.25,
  crestSlow: 0.15,
  crestFast: 0.4,
  launchDrops: 16,
  launchGain: 1.6,
} as const;

const CREST: Partial<BurstOptions> = { spread: 0.5, lift: { min: 1.6, max: 3.6 }, life: { min: 0.35, max: 0.6 }, size: { min: 0.1, max: 0.24 }, gravity: 11, drag: 0.5, jitter: 0.2 };
const LAUNCH: Partial<BurstOptions> = { spread: 0.7, speed: { min: 1, max: 4 }, lift: { min: 2.4, max: 4.8 }, life: { min: 0.45, max: 0.8 }, size: { min: 0.12, max: 0.28 }, gravity: 12, drag: 0.4, jitter: 0.25 };

export interface WaveWater {
  readonly foam: Color;
  readonly power: number;
}

export function crestRate(water: WaveWater, strength: number): number {
  return GHOST_WAVE.crestDrops * (1 + GHOST_WAVE.crestGain * water.power) * strength;
}

export function poweredGlow(water: WaveWater | null): number {
  return GHOST_WAVE.glow * (1 + GHOST_WAVE.powerGlow * (water?.power ?? 0));
}

export function riseIn(age: number): number {
  const t: number = Math.min(1, Math.max(0, age / GHOST_WAVE.rise));
  return t * t * (3 - 2 * t);
}

export function rippleReach(ripple: VfxRipple, age: number, speed: number): number {
  return (age - ripple.delay) * speed;
}

export function rippleLevel(ripple: VfxRipple, age: number, speed: number, reach: number): number {
  const travelled: number = rippleReach(ripple, age, speed);
  if (travelled <= 0 || reach <= 0) return 0;
  const share: number = travelled / reach;
  if (share >= 1) return ripple.strength * Math.max(0, 1 - (travelled - reach) / (speed * GHOST_WAVE.settle)) * (1 - GHOST_WAVE.rippleDim);
  return ripple.strength * riseIn(age - ripple.delay) * (1 - GHOST_WAVE.rippleDim * share);
}

export function hushed(look: VfxWave, age: number): number {
  const t: number = Math.min(1, Math.max(0, (age - (look.quiet - GHOST_WAVE.hush)) / GHOST_WAVE.hush));
  return 1 - t * t * (3 - 2 * t);
}

export function mistLasts(look: VfxWave, age: number): number {
  return Math.max(0, Math.min(GHOST_WAVE.mistLifeMax, look.quiet - age));
}

export function finished(look: VfxWave, age: number, speed: number, reach: number): boolean {
  const last: VfxRipple | undefined = look.ripples.at(-1);
  const leaves: number = last === undefined ? 0 : last.delay;
  return age >= look.quiet || age > leaves + reach / Math.max(speed, 0.001) + GHOST_WAVE.settle;
}

export interface GhostWaveKit {
  readonly parent: Object3D;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
}

export interface GhostWaves {
  launch(id: number, from: Vec2, direction: Vec2, look: VfxWave, color: Color, speed: number, range: number, water: WaveWater | null): void;
  carry(id: number, pos: Vec2): void;
  end(id: number, pos: Vec2): void;
  update(dt: number): void;
  clear(): void;
}

interface Front {
  readonly light: GroundLight;
  readonly shade: GroundLight;
}

interface Wave {
  readonly group: Group;
  readonly from: Vec2;
  readonly direction: Vec2;
  readonly look: VfxWave;
  readonly color: Color;
  readonly haze: Color;
  readonly speed: number;
  readonly main: Front;
  readonly ripples: readonly Front[];
  readonly water: WaveWater | null;
  range: number;
  front: number;
  age: number;
  ended: number | null;
  mistOwed: number;
  dropsOwed: number;
}

export function crestArc(halfWidth: number): number {
  const radius: number = halfWidth * GHOST_WAVE.crest;
  return 2 * Math.asin(Math.min(1, (halfWidth * GHOST_WAVE.cover) / radius));
}

function frontOf(color: Color, look: VfxWave): Front {
  const radius: number = look.halfWidth * GHOST_WAVE.crest;
  const form: GroundLightForm = { kind: 'round', radius, inner: 0, arc: crestArc(look.halfWidth) };
  const glow: GroundLightLook = { fill: 0, band: 1, width: look.depth * GHOST_WAVE.band, wobble: look.halfWidth * GHOST_WAVE.wobble, grain: GHOST_WAVE.grain };
  const light: GroundLight = createGroundLight(color, form, glow);
  const shade: GroundLight = createGroundLight(color.clone().multiplyScalar(0.02), form, { ...glow, width: look.depth * GHOST_WAVE.shadeWidth }, 'shade');
  for (const ground of [light, shade]) {
    ground.mesh.rotation.z = Math.PI;
    ground.setNow(0);
  }
  return { light, shade };
}

function placeFront(front: Front, look: VfxWave, reach: number, strength: number, time: number, shaded: boolean, glowing: number): void {
  const radius: number = look.halfWidth * GHOST_WAVE.crest;
  front.light.mesh.position.z = reach - radius;
  front.light.pose(strength * glowing, time);
  front.shade.mesh.position.z = reach - radius - GHOST_WAVE.shadeGap;
  front.shade.pose(shaded ? strength * GHOST_WAVE.shadeStrength : 0, time);
}

function disposeFront(front: Front): void {
  front.light.dispose();
  front.shade.dispose();
}

export function createGhostWaves(kit: GhostWaveKit): GhostWaves {
  const waves: Map<number, Wave> = new Map<number, Wave>();

  const mist = (wave: Wave, reach: number, strength: number, dt: number): void => {
    const lasts: number = mistLasts(wave.look, wave.age);
    if (lasts <= 0) return;
    wave.mistOwed += wave.look.mist * strength * dt;
    let emitted: number = 0;
    while (wave.mistOwed >= 1 && emitted < GHOST_WAVE.mistCap) {
      wave.mistOwed -= 1;
      emitted += 1;
      const across: number = (Math.random() * 2 - 1) * wave.look.halfWidth;
      const along: number = Math.max(0, reach - GHOST_WAVE.mistGap - Math.random() * GHOST_WAVE.mistBehind);
      const x: number = wave.from.x + wave.direction.x * along + wave.direction.z * across;
      const z: number = wave.from.z + wave.direction.z * along - wave.direction.x * across;
      kit.spray(x, GHOST_WAVE.mistHeight, z, wave.haze, 1, { dirX: wave.direction.x, dirZ: wave.direction.z, spread: 0.6, speed: { min: 0, max: wave.speed * GHOST_WAVE.mistDrift }, lift: { min: GHOST_WAVE.mistLiftMin, max: GHOST_WAVE.mistLiftMax }, life: { min: Math.min(GHOST_WAVE.mistLifeMin, lasts), max: lasts }, size: { min: GHOST_WAVE.mistSizeMin, max: GHOST_WAVE.mistSizeMax }, gravity: -0.2, drag: 3, jitter: 0.3 });
    }
    wave.mistOwed = Math.min(wave.mistOwed, 1);
  };

  const crest = (wave: Wave, water: WaveWater, strength: number, dt: number): void => {
    wave.dropsOwed += crestRate(water, strength) * dt;
    let emitted: number = 0;
    while (wave.dropsOwed >= 1 && emitted < GHOST_WAVE.crestCap) {
      wave.dropsOwed -= 1;
      emitted += 1;
      const across: number = (Math.random() * 2 - 1) * wave.look.halfWidth;
      const along: number = Math.max(0, wave.front - Math.random() * GHOST_WAVE.crestBehind);
      const x: number = wave.from.x + wave.direction.x * along + wave.direction.z * across;
      const z: number = wave.from.z + wave.direction.z * along - wave.direction.x * across;
      kit.spray(x, GHOST_WAVE.crestHeight, z, water.foam, 1, { ...CREST, dirX: wave.direction.x, dirZ: wave.direction.z, speed: { min: wave.speed * GHOST_WAVE.crestSlow, max: wave.speed * GHOST_WAVE.crestFast } });
    }
    wave.dropsOwed = Math.min(wave.dropsOwed, 1);
  };

  const drop = (id: number, wave: Wave): void => {
    disposeFront(wave.main);
    for (const ripple of wave.ripples) disposeFront(ripple);
    wave.group.removeFromParent();
    waves.delete(id);
  };

  return {
    launch(id: number, from: Vec2, direction: Vec2, look: VfxWave, color: Color, speed: number, range: number, water: WaveWater | null): void {
      const group: Group = new Group();
      group.position.set(from.x, floorUp(from.x, GHOST_WAVE.height, from.z), from.z);
      group.rotation.y = facingOf(direction);
      const main: Front = frontOf(color, look);
      const ripples: Front[] = look.ripples.map((): Front => frontOf(color, look));
      for (const front of [main, ...ripples]) group.add(front.shade.mesh, front.light.mesh);
      kit.parent.add(group);
      waves.set(id, { group, from: { x: from.x, z: from.z }, direction: { x: direction.x, z: direction.z }, look, color, haze: color.clone().multiplyScalar(GHOST_WAVE.mistTone), speed, main, ripples, water, range, front: 0, age: 0, ended: null, mistOwed: 0, dropsOwed: 0 });
      if (water !== null) kit.spray(from.x, GHOST_WAVE.crestHeight, from.z, water.foam, Math.round(GHOST_WAVE.launchDrops * (1 + GHOST_WAVE.launchGain * water.power)), { ...LAUNCH, dirX: direction.x, dirZ: direction.z });
    },
    carry(id: number, pos: Vec2): void {
      const wave: Wave | undefined = waves.get(id);
      if (wave === undefined || wave.ended !== null) return;
      wave.front = Math.hypot(pos.x - wave.from.x, pos.z - wave.from.z);
    },
    end(id: number, pos: Vec2): void {
      const wave: Wave | undefined = waves.get(id);
      if (wave === undefined || wave.ended !== null) return;
      wave.front = Math.hypot(pos.x - wave.from.x, pos.z - wave.from.z);
      wave.range = Math.max(wave.front, 0.001);
      wave.ended = wave.age;
    },
    update(dt: number): void {
      for (const [id, wave] of waves) {
        wave.age += dt;
        const share: number = Math.min(1, wave.front / Math.max(wave.range, 0.001));
        const fading: number = wave.ended === null ? 1 : Math.max(0, 1 - (wave.age - wave.ended) / GHOST_WAVE.settle);
        const strength: number = curveAt(wave.look.swell, share) * riseIn(wave.age) * fading * hushed(wave.look, wave.age);
        const glowing: number = poweredGlow(wave.water);
        placeFront(wave.main, wave.look, wave.front, strength, wave.age, true, glowing);
        if (strength > 0) mist(wave, wave.front, strength, dt);
        if (strength > 0 && wave.water !== null && wave.ended === null) crest(wave, wave.water, strength, dt);
        wave.look.ripples.forEach((ripple: VfxRipple, index: number): void => {
          const front: Front | undefined = wave.ripples[index];
          if (front === undefined) return;
          const level: number = rippleLevel(ripple, wave.age, wave.speed, wave.range) * hushed(wave.look, wave.age);
          const reach: number = Math.min(wave.range, Math.max(0, rippleReach(ripple, wave.age, wave.speed)));
          placeFront(front, wave.look, reach, level, wave.age + index, true, glowing);
          if (level > 0) mist(wave, reach, level, dt);
        });
        if (finished(wave.look, wave.age, wave.speed, wave.range)) drop(id, wave);
      }
    },
    clear(): void {
      for (const [id, wave] of waves) drop(id, wave);
    },
  };
}
