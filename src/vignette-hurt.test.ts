import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HurtTarget, HurtVignette } from './vignette-hurt.ts';
import { createHurtVignette, hurtText, VIGNETTE_HURT } from './vignette-hurt.ts';

interface FakeTarget extends HurtTarget {
  readonly writes: string[];
  readonly marked: () => boolean;
}

function fakeTarget(): FakeTarget {
  const writes: string[] = [];
  let marked: boolean = false;
  return {
    writes,
    marked: (): boolean => marked,
    style: {
      setProperty(name: string, value: string): void {
        writes.push(`${name}=${value}`);
      },
    },
    toggleAttribute(name: string, force: boolean): boolean {
      assert.equal(name, VIGNETTE_HURT.shownAttribute);
      marked = force;
      return force;
    },
  };
}

void test('the hurt wash is written with the same three digits it always had', (): void => {
  assert.equal(hurtText(0.12345), '0.123');
  assert.equal(hurtText(0), '0.000');
  assert.equal(hurtText(1), '1.000');
});

void test('the hurt layer is marked shown only while its strength is above zero', (): void => {
  const target: FakeTarget = fakeTarget();
  const vignette: HurtVignette = createHurtVignette(target);
  vignette.show(0);
  assert.equal(target.marked(), false);
  vignette.show(0.4);
  assert.equal(target.marked(), true);
  vignette.show(0.0004);
  assert.equal(target.marked(), false);
  assert.deepEqual(target.writes, ['--hurt=0.000', '--hurt=0.400', '--hurt=0.000']);
});

void test('an unchanged strength writes nothing', (): void => {
  const target: FakeTarget = fakeTarget();
  const vignette: HurtVignette = createHurtVignette(target);
  vignette.show(0.2);
  vignette.show(0.2001);
  vignette.show(0.2);
  assert.deepEqual(target.writes, ['--hurt=0.200']);
});
