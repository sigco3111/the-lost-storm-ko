import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box3, BufferGeometry } from 'three';
import { BoxGeometry, BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Timers } from '../backend/backend.ts';
import { beyond, hanging, oneAtATime, oneGlove, PORTRAIT, STUDIO_CANVAS, THUMBNAIL, trunk, turnWidth, viewportRegion } from './item-thumbnails.ts';

interface ManualTimers extends Timers {
  readonly due: (() => void)[];
}

function manualTimers(): ManualTimers {
  const due: (() => void)[] = [];
  return {
    due,
    after(_ms: number, task: () => void): () => void {
      due.push(task);
      return (): void => undefined;
    },
  };
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

async function fireNext(timers: ManualTimers): Promise<void> {
  await settle();
  const task: (() => void) | undefined = timers.due.shift();
  assert.ok(task !== undefined, 'no timer was waiting');
  task();
  await settle();
}

void test('each shot waits for its own timer before it runs', async (): Promise<void> => {
  const timers: ManualTimers = manualTimers();
  const done: string[] = [];
  const all: Promise<void> = oneAtATime(['sword', 'coat', 'hood'], timers, 0, (item: string): Promise<void> => {
    done.push(item);
    return Promise.resolve();
  });
  await settle();
  assert.deepEqual(done, []);
  await fireNext(timers);
  assert.deepEqual(done, ['sword']);
  await fireNext(timers);
  assert.deepEqual(done, ['sword', 'coat']);
  await fireNext(timers);
  await all;
  assert.deepEqual(done, ['sword', 'coat', 'hood']);
});

void test('the next shot waits until the one before it has finished', async (): Promise<void> => {
  const timers: ManualTimers = manualTimers();
  const finishers: (() => void)[] = [];
  const started: string[] = [];
  const all: Promise<void> = oneAtATime(['sword', 'coat'], timers, 0, (item: string): Promise<void> => {
    started.push(item);
    return new Promise<void>((resolve: () => void): void => {
      finishers.push(resolve);
    });
  });
  await fireNext(timers);
  assert.deepEqual(started, ['sword']);
  assert.equal(timers.due.length, 0);
  for (const finish of finishers.splice(0)) finish();
  await fireNext(timers);
  assert.deepEqual(started, ['sword', 'coat']);
  for (const finish of finishers.splice(0)) finish();
  await all;
});

function slab(width: number, height: number, at: number): Mesh {
  const geometry: BoxGeometry = new BoxGeometry(width, height, 0.2);
  geometry.translate(at, 0, 0);
  return new Mesh(geometry, new MeshBasicMaterial());
}

void test('a chest piece with its sleeves out is framed on the trunk, and a narrow piece is framed whole', (): void => {
  const wide: Group = new Group();
  wide.add(slab(1.8, 0.7, 0));
  const framed: Vector3 = trunk(wide).getSize(new Vector3());
  assert.ok(Math.abs(framed.x - 0.7 * THUMBNAIL.trunkWide) < 1e-6);
  assert.ok(Math.abs(framed.y - 0.7) < 1e-6);
  const narrow: Group = new Group();
  narrow.add(slab(0.5, 0.7, 0));
  assert.ok(Math.abs(trunk(narrow).getSize(new Vector3()).x - 0.5) < 1e-6);
});

void test('a pair of gloves is framed on one glove only', (): void => {
  const pair: Group = new Group();
  const both: BoxGeometry = new BoxGeometry(0.3, 0.1, 0.1);
  both.translate(-0.7, 0, 0);
  const other: BoxGeometry = new BoxGeometry(0.3, 0.1, 0.1);
  other.translate(0.7, 0, 0);
  const left: Mesh = new Mesh(both, new MeshBasicMaterial());
  const right: Mesh = new Mesh(other, new MeshBasicMaterial());
  pair.add(left, right);
  const one: Box3 = oneGlove(pair);
  assert.ok(one.min.x > 0.5);
  assert.ok(Math.abs(one.getSize(new Vector3()).x - 0.3) < 1e-6);
  const merged: Group = new Group();
  const span: BoxGeometry = new BoxGeometry(1.7, 0.1, 0.1, 16, 1, 1);
  merged.add(new Mesh(span, new MeshBasicMaterial()));
  const half: Box3 = oneGlove(merged);
  assert.ok(half.min.x >= 0.85 * THUMBNAIL.gloveFrom - 0.11);
  assert.ok(half.max.x > 0.84);
});

void test('a charm is framed on what hangs at the bottom of its cord, not the whole loop', (): void => {
  const charm: Group = new Group();
  const loop: BoxGeometry = new BoxGeometry(0.3, 0.3, 0.01, 1, 30, 1);
  loop.translate(0, 0.15, 0);
  const pendant: BoxGeometry = new BoxGeometry(0.03, 0.03, 0.01);
  pendant.translate(0.002, -0.015, 0);
  charm.add(new Mesh(loop, new MeshBasicMaterial()), new Mesh(pendant, new MeshBasicMaterial()));
  const framed: Box3 = hanging(charm);
  const size: Vector3 = framed.getSize(new Vector3());
  assert.ok(Math.abs(framed.min.y + 0.03) < 1e-6);
  assert.ok(framed.max.y <= -0.03 + 0.33 * THUMBNAIL.charmShare + 1e-6);
  assert.ok(size.y < 0.33 * 0.5);
});

function count(geometry: BufferGeometry, name: string): number {
  const held: unknown = geometry.getAttribute(name);
  return held instanceof BufferAttribute ? held.count : 0;
}

void test('the hand drawn with a glove is the arm piece cut at the wrist: only whole triangles past the cut are kept', (): void => {
  const arm: BoxGeometry = new BoxGeometry(2, 0.1, 0.1, 20, 1, 1);
  const hand: BufferGeometry = beyond(arm, 0.5);
  const positions: unknown = hand.getAttribute('position');
  assert.ok(positions instanceof BufferAttribute);
  assert.ok(positions.count > 0 && positions.count % 3 === 0);
  let least: number = Infinity;
  let most: number = -Infinity;
  for (let index: number = 0; index < positions.count; index += 1) {
    least = Math.min(least, positions.getX(index));
    most = Math.max(most, positions.getX(index));
  }
  assert.ok(least >= 0.5 - 1e-6, `a triangle reaches back to ${least}`);
  assert.ok(Math.abs(most - 1) < 1e-6);
  assert.equal(count(hand, 'normal'), positions.count);
  assert.equal(count(hand, 'uv'), positions.count);
  assert.equal(hand.index, null);
  assert.equal(count(beyond(arm, 2), 'position'), 0);
});

void test('a turning figure is framed on the widest it gets in a whole turn, so a held blade never leaves the picture', (): void => {
  assert.equal(turnWidth(new Vector3(0.6, 1.8, 0.8)), 1);
  assert.ok(turnWidth(new Vector3(0.4, 1.8, 1.2)) >= 1.2);
  assert.ok(turnWidth(new Vector3(0.4, 1.8, 1.2)) >= 0.4);
});

void test('the studio canvas holds both a portrait and a thumbnail, so drawing one after the other never resizes it', (): void => {
  assert.ok(STUDIO_CANVAS.width >= PORTRAIT.width && STUDIO_CANVAS.height >= PORTRAIT.height);
  assert.ok(STUDIO_CANVAS.width >= THUMBNAIL.size && STUDIO_CANVAS.height >= THUMBNAIL.size);
});

void test('a viewport at the bottom left of the drawing buffer is read from the bottom left of the canvas', (): void => {
  assert.deepEqual(viewportRegion(720, 128, 128), { x: 0, y: 592, width: 128, height: 128 });
  assert.deepEqual(viewportRegion(720, 480, 720), { x: 0, y: 0, width: 480, height: 720 });
});
