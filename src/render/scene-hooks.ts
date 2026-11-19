import type { Camera, Object3D, WebGLRenderer } from 'three';
import { Scene } from 'three';

export type SceneHook = (renderer: WebGLRenderer, camera: Camera) => void;

const hooked: WeakMap<Scene, Set<SceneHook>> = new WeakMap();

function runAll(scene: Scene, renderer: WebGLRenderer, camera: Camera): void {
  const hooks: Set<SceneHook> | undefined = hooked.get(scene);
  if (hooks !== undefined) for (const hook of hooks) hook(renderer, camera);
}

export function beforeScene(scene: Scene, hook: SceneHook): () => void {
  let hooks: Set<SceneHook> | undefined = hooked.get(scene);
  if (hooks === undefined) {
    hooks = new Set();
    hooked.set(scene, hooks);
    const earlier: Scene['onBeforeRender'] = scene.onBeforeRender.bind(scene);
    scene.onBeforeRender = (renderer, renderedScene, camera, geometry, material, group): void => {
      earlier(renderer, renderedScene, camera, geometry, material, group);
      runAll(scene, renderer, camera);
    };
  }
  hooks.add(hook);
  return (): void => {
    hooked.get(scene)?.delete(hook);
  };
}

export function sceneOf(object: Object3D): Scene | null {
  let root: Object3D = object;
  while (root.parent !== null) root = root.parent;
  return root instanceof Scene ? root : null;
}
