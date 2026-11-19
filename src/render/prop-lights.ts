import { Vector3 } from 'three';
import type { PropLight } from '../../sim/content/types.ts';

export const PROP_LIGHTS = {
  flickerSpeed: 9,
  flickerDepth: 0.22,
  breatheSpeed: 0.7,
  breatheDepth: 0.1,
} as const;

export function flamePoint(light: PropLight, x: number, y: number, z: number, yaw: number): Vector3 | null {
  switch (light.form) {
    case 'flame':
      return new Vector3(x + Math.sin(yaw) * light.reach, y + light.height, z + Math.cos(yaw) * light.reach);
    case 'glow':
      break;
  }
  return null;
}

export function lightPoint(light: PropLight, x: number, y: number, z: number, yaw: number): Vector3 {
  switch (light.form) {
    case 'flame':
      return new Vector3(x + Math.sin(yaw) * light.reach, y + light.height + light.lift, z + Math.cos(yaw) * light.reach);
    case 'glow':
      break;
  }
  return new Vector3(x, y + light.height, z);
}

export function lightLevel(form: PropLight['form'], time: number, phase: number): number {
  switch (form) {
    case 'flame': {
      const wobble: number = Math.sin(time * PROP_LIGHTS.flickerSpeed + phase) * 0.6 + Math.sin(time * PROP_LIGHTS.flickerSpeed * 2.7 + phase * 1.7) * 0.4;
      return 1 - PROP_LIGHTS.flickerDepth * 0.5 + wobble * PROP_LIGHTS.flickerDepth * 0.5;
    }
    case 'glow':
      break;
  }
  return 1 - PROP_LIGHTS.breatheDepth * 0.5 + Math.sin(time * PROP_LIGHTS.breatheSpeed + phase) * PROP_LIGHTS.breatheDepth * 0.5;
}
