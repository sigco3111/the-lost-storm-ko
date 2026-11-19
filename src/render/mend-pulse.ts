import type { Color, Group, Mesh } from 'three';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, flare, GROUND_LIGHT, held, spread } from './ground-light.ts';
import { glow } from './effect-shapes.ts';
import type { BurstOptions } from './particles.ts';
import { floorUp } from './terrain-lift.ts';

export const MEND_PULSE = {
  waveTime: 0.9,
  waveGlow: 0.65,
  waveStrength: 0.5,
  waveFill: 0.08,
  waveWidth: 0.3,
  waveWobble: 0.12,
  waveGrain: 0.55,
  waveLift: 0.05,
  motesPerMetre: 4,
  motesMax: 40,
  moteSpread: 0.9,
  moteTurn: 0.5,
  moteFloor: 0.2,
  moteJitter: 0.3,
  moteLight: 6,
  moteHeight: 3,
  touchTime: 0.75,
  touchRadius: 0.95,
  touchStrength: 0.8,
  touchWidth: 0.45,
  touchMotes: 14,
  touchHeight: 1.1,
  touchLight: 3,
} as const;

export interface MendKit {
  readonly add: (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
}

export interface MendPulses {
  readonly pulse: (x: number, z: number, radius: number, color: Color) => void;
  readonly touch: (x: number, z: number, color: Color) => void;
}

export function waveStrength(t: number): number {
  return MEND_PULSE.waveStrength * held(t);
}

export function moteCount(radius: number): number {
  return Math.min(MEND_PULSE.motesMax, Math.max(1, Math.round(radius * MEND_PULSE.motesPerMetre)));
}

export function createMendPulses(deps: MendKit): MendPulses {
  const pulse = (x: number, z: number, radius: number, color: Color): void => {
    const tint: Color = glow(color, MEND_PULSE.waveGlow);
    const wave: GroundLight = createGroundLight(tint, { kind: 'round', radius, inner: 0, arc: Math.PI * 2 }, { fill: MEND_PULSE.waveFill, band: 1, width: radius * MEND_PULSE.waveWidth, wobble: radius * MEND_PULSE.waveWobble, grain: MEND_PULSE.waveGrain });
    wave.mesh.position.set(x, floorUp(x, GROUND_LIGHT.height + MEND_PULSE.waveLift, z), z);
    deps.add(
      wave.mesh,
      MEND_PULSE.waveTime,
      (t: number): void => {
        wave.front(spread(t));
        wave.pose(waveStrength(t), t * MEND_PULSE.waveTime);
      },
      null,
    );
    const count: number = moteCount(radius);
    for (let step: number = 0; step < count; step += 1) {
      const angle: number = (step / count) * Math.PI * 2 + Math.random() * MEND_PULSE.moteTurn;
      const out: number = radius * MEND_PULSE.moteSpread * Math.sqrt(Math.random());
      deps.spray(x + Math.sin(angle) * out, MEND_PULSE.moteFloor, z + Math.cos(angle) * out, color, 1, { speed: { min: 0.1, max: 0.5 }, lift: { min: 1.2, max: 3.2 }, life: { min: 0.6, max: 1.2 }, gravity: -1.5, drag: 1.4, size: { min: 0.25, max: 0.55 }, jitter: MEND_PULSE.moteJitter });
    }
    deps.flashLight(x, MEND_PULSE.moteHeight, z, color, MEND_PULSE.moteLight);
  };

  const touch = (x: number, z: number, color: Color): void => {
    const spot: GroundLight = createGroundLight(glow(color, MEND_PULSE.waveGlow), { kind: 'round', radius: MEND_PULSE.touchRadius, inner: 0, arc: Math.PI * 2 }, { fill: 1, band: 0, width: MEND_PULSE.touchRadius * MEND_PULSE.touchWidth, wobble: MEND_PULSE.touchRadius * MEND_PULSE.waveWobble });
    spot.mesh.position.set(x, floorUp(x, GROUND_LIGHT.height + MEND_PULSE.waveLift, z), z);
    deps.add(
      spot.mesh,
      MEND_PULSE.touchTime,
      (t: number): void => {
        spot.pose(MEND_PULSE.touchStrength * flare(t), t * MEND_PULSE.touchTime);
      },
      null,
    );
    deps.spray(x, MEND_PULSE.touchHeight, z, color, MEND_PULSE.touchMotes, { speed: { min: 0.2, max: 0.9 }, lift: { min: 1, max: 2.6 }, life: { min: 0.4, max: 0.9 }, gravity: -2, drag: 1.6, size: { min: 0.2, max: 0.45 }, jitter: 0.35 });
    deps.flashLight(x, MEND_PULSE.touchHeight, z, color, MEND_PULSE.touchLight);
  };

  return { pulse, touch };
}
