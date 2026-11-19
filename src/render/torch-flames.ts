import type { Color, Scene, Vector3 } from 'three';
import { Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { glow } from './effect-shapes.ts';
import type { BurstOptions } from './particles.ts';
import { liftHere } from './terrain-lift.ts';

export const TORCH_FLAMES = {
  size: 0.17,
  glow: 3.4,
  widthSegments: 10,
  heightSegments: 8,
  emberEvery: 0.07,
  emberRise: 0.1,
  rest: 0.85,
  swing: 0.25,
  swingRate: 17,
  swingStep: 2.1,
  flutter: 0.12,
  flutterRate: 41,
} as const;

const EMBER_SPRAY: Partial<BurstOptions> = { speed: { min: 0, max: 0.5 }, lift: { min: 0.8, max: 2.4 }, life: { min: 0.6, max: 1.5 }, size: { min: 0.2, max: 0.45 }, gravity: -0.6, drag: 0.5, jitter: 0.15 };

export function flicker(time: number, index: number): number {
  return TORCH_FLAMES.rest + TORCH_FLAMES.swing * Math.sin(time * TORCH_FLAMES.swingRate + index * TORCH_FLAMES.swingStep) + TORCH_FLAMES.flutter * Math.sin(time * TORCH_FLAMES.flutterRate + index);
}

export interface TorchFlames {
  place(points: readonly Vector3[]): void;
  update(dt: number, time: number): void;
}

export function createTorchFlames(scene: Scene, ember: Color, spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void): TorchFlames {
  const material: MeshBasicMaterial = new MeshBasicMaterial({ color: glow(ember, TORCH_FLAMES.glow) });
  const geometry: SphereGeometry = new SphereGeometry(TORCH_FLAMES.size, TORCH_FLAMES.widthSegments, TORCH_FLAMES.heightSegments);
  let torches: readonly Vector3[] = [];
  let flames: Mesh[] = [];
  let emberTimer: number = 0;

  return {
    place(points: readonly Vector3[]): void {
      for (const flame of flames) flame.removeFromParent();
      torches = points;
      flames = points.map((point: Vector3): Mesh => {
        const flame: Mesh = new Mesh(geometry, material);
        flame.position.copy(point);
        scene.add(flame);
        return flame;
      });
    },
    update(dt: number, time: number): void {
      emberTimer -= dt;
      if (emberTimer <= 0 && torches.length > 0) {
        emberTimer = TORCH_FLAMES.emberEvery;
        const torch: Vector3 | undefined = torches[Math.floor(Math.random() * torches.length)];
        if (torch !== undefined) spray(torch.x, torch.y + TORCH_FLAMES.emberRise - liftHere(torch.x, torch.z), torch.z, ember, 1, EMBER_SPRAY);
      }
      flames.forEach((flame: Mesh, index: number): void => {
        flame.scale.setScalar(flicker(time, index));
      });
    },
  };
}
