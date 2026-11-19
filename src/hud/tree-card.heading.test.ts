import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headingInto } from './tree-card.ts';
import type { CardBox } from './tree-card.ts';

const CARD: CardBox = { x: 100, y: 0, width: 250, height: 180 };

void test('a pointer moving straight at the card is heading into it', (): void => {
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 66, y: 90 }, CARD), true);
});

void test('a pointer moving towards a corner of the card is heading into it', (): void => {
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 64, y: 86 }, CARD), true);
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 64, y: 94 }, CARD), true);
});

void test('a pointer moving away from the card or along past it is not', (): void => {
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 54, y: 90 }, CARD), false);
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 60, y: 96 }, CARD), false);
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 60, y: 84 }, CARD), false);
  assert.equal(headingInto({ x: 60, y: 300 }, { x: 54, y: 306 }, CARD), false);
});

void test('a pointer below the card moving up into it is heading into it', (): void => {
  assert.equal(headingInto({ x: 200, y: 230 }, { x: 201, y: 224 }, CARD), true);
  assert.equal(headingInto({ x: 200, y: 230 }, { x: 260, y: 236 }, CARD), false);
});

void test('a pointer that did not move, started in the card, or has no card to head for is not', (): void => {
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 60, y: 90 }, CARD), false);
  assert.equal(headingInto({ x: 150, y: 90 }, { x: 160, y: 90 }, CARD), false);
  assert.equal(headingInto({ x: 60, y: 90 }, { x: 66, y: 90 }, { x: 0, y: 0, width: 0, height: 0 }), false);
});
