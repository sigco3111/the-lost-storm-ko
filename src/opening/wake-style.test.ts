import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StyleTarget } from './wake-style.ts';
import { createWakeStyle, WAKE_CLEAR, WAKE_STYLE } from './wake-style.ts';

interface Written {
  readonly name: string;
  readonly value: string;
}

function target(): { readonly element: StyleTarget; readonly writes: Written[] } {
  const writes: Written[] = [];
  return { element: { style: { setProperty: (name: string, value: string): void => void writes.push({ name, value }) } }, writes };
}

void test('the wake shade goes on the veil and the blur on the canvas, the only elements that read them', (): void => {
  const veil = target();
  const scene = target();
  createWakeStyle(veil.element, scene.element).show({ soft: 0.25, lids: 1, blur: 3.456 });
  assert.deepEqual(veil.writes, [
    { name: WAKE_STYLE.soft, value: '0.250' },
    { name: WAKE_STYLE.lids, value: '1.000' },
  ]);
  assert.deepEqual(scene.writes, [{ name: WAKE_STYLE.blur, value: '3.46px' }]);
});

void test('a frame that looks the same writes nothing, so a held shot never re-styles anything', (): void => {
  const veil = target();
  const scene = target();
  const style = createWakeStyle(veil.element, scene.element);
  style.show({ soft: 0.5, lids: 0.2, blur: 1 });
  style.show({ soft: 0.5001, lids: 0.2, blur: 1.001 });
  assert.equal(veil.writes.length, 2);
  assert.equal(scene.writes.length, 1);
  style.show({ soft: 0.5, lids: 0.3, blur: 1 });
  assert.deepEqual(veil.writes.at(-1), { name: WAKE_STYLE.lids, value: '0.300' });
  assert.equal(veil.writes.length, 3);
  assert.equal(scene.writes.length, 1);
});

void test('the wake clears to nothing and a page with no veil or canvas is left alone', (): void => {
  const veil = target();
  const scene = target();
  const style = createWakeStyle(veil.element, scene.element);
  style.show({ soft: 1, lids: 1, blur: 4 });
  style.show(WAKE_CLEAR);
  assert.deepEqual(veil.writes.slice(-2), [
    { name: WAKE_STYLE.soft, value: '0.000' },
    { name: WAKE_STYLE.lids, value: '0.000' },
  ]);
  assert.deepEqual(scene.writes.at(-1), { name: WAKE_STYLE.blur, value: '0.00px' });
  assert.doesNotThrow((): void => createWakeStyle(null, null).show({ soft: 1, lids: 1, blur: 1 }));
});
