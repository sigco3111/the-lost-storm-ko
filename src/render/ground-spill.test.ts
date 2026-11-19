import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fringeShare, spreadsOnto } from './ground-spill.ts';

void test('the surface that spills more spreads onto its neighbour, never the other way', (): void => {
  assert.equal(spreadsOnto({ id: 'ash', spill: 3 }, { id: 'basalt', spill: 0 }), true);
  assert.equal(spreadsOnto({ id: 'basalt', spill: 0 }, { id: 'ash', spill: 3 }), false);
});

void test('two surfaces that spill alike blend one way only, so the seam is drawn once', (): void => {
  const crust = { id: 'cooled_crust', spill: 1 } as const;
  const stone = { id: 'scorched_stone', spill: 1 } as const;
  assert.notEqual(spreadsOnto(crust, stone), spreadsOnto(stone, crust));
});

void test('surfaces that do not spill keep a crisp seam, and a surface never spreads onto itself', (): void => {
  assert.equal(spreadsOnto({ id: 'planks', spill: 0 }, { id: 'flagstone', spill: 0 }), false);
  assert.equal(spreadsOnto({ id: 'flagstone', spill: 0 }, { id: 'planks', spill: 0 }), false);
  assert.equal(spreadsOnto({ id: 'ash', spill: 3 }, { id: 'ash', spill: 3 }), false);
});

void test('a fringe is whole on the seam whatever its noise, and gone past its reach', (): void => {
  for (const ragged of [-0.4, 0, 0.4]) assert.equal(fringeShare(0, 1.9, ragged), 1);
  assert.equal(fringeShare(1.9, 1.9, 0), 0);
  assert.ok(fringeShare(0.9, 1.9, 0) > 0 && fringeShare(0.9, 1.9, 0) < 1);
  assert.ok(fringeShare(0.9, 1.9, 0.3) > fringeShare(0.9, 1.9, -0.3));
});
