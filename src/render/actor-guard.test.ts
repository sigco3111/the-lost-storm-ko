import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene } from 'three';
import type { ActorGuard } from './actor-guard.ts';
import { createActorGuard, drawable, readyToInspect, setOffView, shownMaterial } from './actor-guard.ts';
import { fadeMaterials, startSwap, stepSwap } from './body-swap.ts';
import { RestingGroup } from './resting-group.ts';

function body(): { readonly root: Group; readonly mesh: Mesh<BoxGeometry, MeshStandardMaterial> } {
  const root: Group = new Group();
  const mesh: Mesh<BoxGeometry, MeshStandardMaterial> = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  root.add(mesh);
  return { root, mesh };
}

void test('a material draws unless it is hidden, writes no colour, or is transparent with no opacity', (): void => {
  assert.equal(shownMaterial(new MeshStandardMaterial()), true);
  assert.equal(shownMaterial(new MeshBasicMaterial({ visible: false })), false);
  assert.equal(shownMaterial(new MeshBasicMaterial({ colorWrite: false })), false);
  assert.equal(shownMaterial(new MeshBasicMaterial({ transparent: true, opacity: 0 })), false);
  assert.equal(shownMaterial(new MeshBasicMaterial({ transparent: true, opacity: 0.4 })), true);
  assert.equal(shownMaterial(new MeshBasicMaterial({ opacity: 0 })), true);
});

void test('an actor is drawable only with a shown mesh on a visible chain, a finite place and a real scale', (): void => {
  const { root, mesh } = body();
  assert.equal(drawable(root), true);
  mesh.visible = false;
  assert.equal(drawable(root), false);
  mesh.visible = true;
  root.visible = false;
  assert.equal(drawable(root), false);
  root.visible = true;
  mesh.material.visible = false;
  assert.equal(drawable(root), false);
  mesh.material = new MeshStandardMaterial();
  assert.equal(drawable(root), true);
  root.scale.set(0, 0, 0);
  assert.equal(drawable(root), false);
  root.scale.set(1, 1, 1);
  root.position.set(Number.NaN, 0, 0);
  assert.equal(drawable(root), false);
  assert.equal(drawable(new Group()), false);
});

void test('a mesh with several materials draws when any one of them is shown', (): void => {
  const root: Group = new Group();
  root.add(new Mesh(new BoxGeometry(), [new MeshBasicMaterial({ visible: false }), new MeshStandardMaterial()]));
  assert.equal(drawable(root), true);
  const hidden: Group = new Group();
  hidden.add(new Mesh(new BoxGeometry(), [new MeshBasicMaterial({ visible: false }), new MeshBasicMaterial({ transparent: true, opacity: 0 })]));
  assert.equal(drawable(hidden), false);
});

void test('a live actor pulled out of the scene is put back and reported once', (): void => {
  const reports: string[] = [];
  const guard: ActorGuard = createActorGuard((message: string): void => {
    reports.push(message);
  });
  const scene: Scene = new Scene();
  const { root } = body();
  scene.add(root);
  assert.equal(guard.keep(7, root, scene, 'unfinished_brute'), false);
  root.removeFromParent();
  assert.equal(guard.keep(7, root, scene, 'unfinished_brute'), true);
  assert.equal(root.parent, scene);
  const holder: Group = new Group();
  holder.add(root);
  assert.equal(guard.keep(7, root, scene, 'unfinished_brute'), true);
  assert.equal(root.parent, scene);
  assert.equal(reports.length, 1);
  assert.match(reports[0] ?? '', /unfinished_brute \(#7\)/);
});

void test('an undrawable actor is reported once per monster, and a forgotten id may be reported again', (): void => {
  const reports: string[] = [];
  const guard: ActorGuard = createActorGuard((message: string): void => {
    reports.push(message);
  });
  const { root, mesh } = body();
  assert.equal(guard.inspect(3, root, 'unfinished_taker'), true);
  mesh.visible = false;
  assert.equal(guard.inspect(3, root, 'unfinished_taker'), false);
  assert.equal(guard.inspect(3, root, 'unfinished_taker'), false);
  guard.missing(3, 'unfinished_taker', 'stolen_jerkin');
  guard.missing(3, 'unfinished_taker', 'stolen_jerkin');
  assert.equal(reports.length, 2);
  guard.forget(3);
  assert.equal(guard.inspect(3, root, 'unfinished_taker'), false);
  assert.equal(reports.length, 3);
});

void test('an actor left undrawn off view is still drawable, so its first check keeps its gear and the body walk counts it', (): void => {
  const { root, mesh } = body();
  setOffView(root, true);
  assert.equal(root.visible, false);
  assert.equal(drawable(root), true);
  assert.equal(createActorGuard((): undefined => undefined).inspect(1, root, 'skeleton'), true);
  mesh.visible = false;
  assert.equal(drawable(root), false);
  mesh.visible = true;
  setOffView(root, false);
  assert.equal(root.visible, true);
  root.visible = false;
  assert.equal(drawable(root), false);
});

void test('a rig left off view rests, so the scene skips its bones, and it is up to date the moment it is back in view', (): void => {
  const scene: Scene = new Scene();
  const root: RestingGroup = new RestingGroup();
  const mesh: Mesh<BoxGeometry, MeshStandardMaterial> = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  root.add(mesh);
  scene.add(root);
  scene.updateMatrixWorld();
  setOffView(root, true);
  assert.equal(root.resting, true);
  assert.equal(drawable(root), true);
  root.position.set(3, 0, 5);
  scene.updateMatrixWorld();
  assert.equal(mesh.matrixWorld.elements[12], 0);
  setOffView(root, false);
  assert.equal(root.resting, false);
  assert.equal(root.visible, true);
  assert.equal(mesh.matrixWorld.elements[12], 3);
  assert.equal(mesh.matrixWorld.elements[14], 5);
  setOffView(root, false);
  assert.equal(root.resting, false);
});

void test('a real body that arrives on a still frame is not inspected until its cross-fade has finished, so it keeps its gear', (): void => {
  const { root, mesh } = body();
  mesh.material.transparent = true;
  const swap = startSwap(root);
  fadeMaterials([mesh.material], stepSwap(swap, 0).incoming);
  assert.equal(drawable(root), false);
  const moment = { checked: false, alive: true, swapping: true, fadingOut: false } as const;
  assert.equal(readyToInspect(moment), false);
  let done: boolean = false;
  for (let frame: number = 0; frame < 600 && !done; frame += 1) {
    const mix = stepSwap(swap, 1 / 60);
    fadeMaterials([mesh.material], mix.incoming);
    done = mix.done;
  }
  assert.equal(done, true);
  assert.equal(readyToInspect({ ...moment, swapping: false }), true);
  assert.equal(drawable(root), true);
});

void test('a body is inspected once, only while alive and not fading out as an echo', (): void => {
  const ready = { checked: false, alive: true, swapping: false, fadingOut: false } as const;
  assert.equal(readyToInspect(ready), true);
  assert.equal(readyToInspect({ ...ready, checked: true }), false);
  assert.equal(readyToInspect({ ...ready, alive: false }), false);
  assert.equal(readyToInspect({ ...ready, fadingOut: true }), false);
});
