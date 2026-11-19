import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { createDropLooks } from './drop-looks.ts';

function model(): Group {
  const group: Group = new Group();
  group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  return group;
}

void test('nothing is offered to a zone warm-up before the drop looks are known', (): void => {
  assert.deepEqual(createDropLooks().standIns(), []);
});

void test('every zone warm-up gets its own copies of the remembered looks, sharing their materials', (): void => {
  const looks = createDropLooks();
  const first: Group = model();
  looks.remember([first]);
  const once = looks.standIns();
  const twice = looks.standIns();
  assert.equal(once.length, 1);
  assert.notEqual(once[0], first);
  assert.notEqual(once[0], twice[0]);
  const source: unknown = first.children[0] instanceof Mesh ? first.children[0].material : null;
  const copy: unknown = once[0]?.children[0] instanceof Mesh ? once[0].children[0].material : null;
  assert.equal(copy, source);
});

void test('remembering again replaces the earlier looks', (): void => {
  const looks = createDropLooks();
  looks.remember([model(), model()]);
  looks.remember([model()]);
  assert.equal(looks.standIns().length, 1);
});
