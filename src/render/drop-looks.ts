import type { Object3D } from 'three';

export interface DropLooks {
  remember(models: readonly Object3D[]): void;
  standIns(): Object3D[];
}

export function createDropLooks(): DropLooks {
  let kept: readonly Object3D[] = [];
  return {
    remember(models: readonly Object3D[]): void {
      kept = models;
    },
    standIns(): Object3D[] {
      return kept.map((model: Object3D): Object3D => model.clone(true));
    },
  };
}
