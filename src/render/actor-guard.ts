import type { Material, Object3D } from 'three';
import { Mesh } from 'three';
import { RestingGroup } from './resting-group.ts';

export interface ActorGuard {
  keep(id: number, root: Object3D, scene: Object3D, label: string): boolean;
  inspect(id: number, root: Object3D, label: string): boolean;
  missing(id: number, label: string, what: string): void;
  forget(id: number): void;
}

export interface InspectMoment {
  readonly checked: boolean;
  readonly alive: boolean;
  readonly swapping: boolean;
  readonly fadingOut: boolean;
}

export function readyToInspect(moment: InspectMoment): boolean {
  return !moment.checked && moment.alive && !moment.swapping && !moment.fadingOut;
}

export function shownMaterial(material: Material): boolean {
  return material.visible && material.colorWrite && (!material.transparent || material.opacity > 0);
}

function placed(root: Object3D): boolean {
  const { position, scale } = root;
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z) && scale.x !== 0 && scale.y !== 0 && scale.z !== 0;
}

const offView: WeakSet<Object3D> = new WeakSet<Object3D>();

export function setOffView(root: Object3D, off: boolean): void {
  if (off) offView.add(root);
  else offView.delete(root);
  if (root.visible === off) root.visible = !off;
  if (!(root instanceof RestingGroup)) return;
  if (off) root.rest();
  else root.wake();
}

export function drawable(root: Object3D): boolean {
  if (!placed(root)) return false;
  if (!root.visible && !offView.has(root)) return false;
  let found: boolean = false;
  const look = (object: Object3D): void => {
    if (found || !(object instanceof Mesh)) return;
    const materials: readonly Material[] = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(shownMaterial)) found = true;
  };
  look(root);
  for (const child of root.children) child.traverseVisible(look);
  return found;
}

export function createActorGuard(report: (message: string) => void): ActorGuard {
  const told: Map<number, Set<string>> = new Map<number, Set<string>>();
  const once = (id: number, kind: string, message: string): void => {
    const kinds: Set<string> = told.get(id) ?? new Set<string>();
    told.set(id, kinds);
    if (kinds.has(kind)) return;
    kinds.add(kind);
    report(message);
  };
  return {
    keep(id: number, root: Object3D, scene: Object3D, label: string): boolean {
      if (root.parent === scene) return false;
      scene.add(root);
      once(id, 'detached', `Monster ${label} (#${id}) was alive but not in the scene; it was put back`);
      return true;
    },
    inspect(id: number, root: Object3D, label: string): boolean {
      if (drawable(root)) return true;
      once(id, 'undrawable', `Monster ${label} (#${id}) was alive with nothing drawable; it falls back to its bare body`);
      return false;
    },
    missing(id: number, label: string, what: string): void {
      once(id, 'missing', `Monster ${label} (#${id}) is drawn without ${what}, which did not load`);
    },
    forget(id: number): void {
      told.delete(id);
    },
  };
}
