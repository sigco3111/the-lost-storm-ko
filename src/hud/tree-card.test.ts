import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardNode, CLOSED_CARD, stepCard } from './tree-card.ts';
import type { CardEvent, CardState } from './tree-card.ts';

function run(events: readonly CardEvent[], from: CardState = CLOSED_CARD): CardState {
  return events.reduce((state: CardState, event: CardEvent): CardState => stepCard(state, event), from);
}

const OPEN: CardEvent = { type: 'open' };
const CLOSE: CardEvent = { type: 'close' };
const CLEAR: CardEvent = { type: 'clear' };

function at(node: string | null): CardEvent {
  return { type: 'point', node };
}

function pin(node: string): CardEvent {
  return { type: 'pin', node };
}

function settle(node: string | null): CardEvent {
  return { type: 'settle', node };
}

void test('the tree opens with no card', (): void => {
  assert.equal(cardNode(run([OPEN])), null);
});

void test('a card shows the moment the pointer reaches a place', (): void => {
  assert.equal(cardNode(run([OPEN, at('thick_skin')])), 'thick_skin');
});

void test('a hovered card goes the moment the pointer leaves its place', (): void => {
  assert.equal(cardNode(run([OPEN, at('thick_skin'), at(null)])), null);
});

void test('moving from one place to the next shows the next card at once', (): void => {
  assert.equal(cardNode(run([OPEN, at('a'), at('b')])), 'b');
  assert.equal(cardNode(run([OPEN, at('a'), at(null), at('b')])), 'b');
});

void test('a clicked card goes the moment the pointer leaves its place', (): void => {
  const clicked: CardState = run([OPEN, at('thick_skin'), pin('thick_skin')]);
  assert.equal(cardNode(clicked), 'thick_skin');
  assert.equal(cardNode(run([at('thick_skin')], clicked)), 'thick_skin');
  assert.equal(cardNode(run([at(null)], clicked)), null);
  assert.equal(cardNode(run([at('thick_skin'), at(null)], clicked)), null);
});

void test('a place already taken and clicked again lets its card go on leaving', (): void => {
  const twice: CardState = run([OPEN, at('a'), pin('a'), pin('a'), at('a'), at(null)]);
  assert.equal(cardNode(twice), null);
  assert.equal(twice.pinned, null);
});

void test('pointing at another place drops a clicked card for that place', (): void => {
  const moved: CardState = run([OPEN, pin('a'), at('b')]);
  assert.equal(cardNode(moved), 'b');
  assert.equal(cardNode(run([at(null)], moved)), null);
});

void test('the view settling with the pointer on empty ground keeps a card pinned by a search', (): void => {
  const found: CardState = run([OPEN, pin('thick_skin'), settle(null)]);
  assert.equal(cardNode(found), 'thick_skin');
  assert.equal(cardNode(run([settle('a')], found)), 'a');
  assert.equal(cardNode(run([at(null)], found)), null);
  assert.equal(cardNode(run([CLOSE, settle('a')], found)), null);
});

void test('a click on empty ground or a drag drops a clicked card at once', (): void => {
  assert.equal(cardNode(run([OPEN, pin('thick_skin'), CLEAR])), null);
});

void test('a click on a new place shows that place, not the one hovered before', (): void => {
  assert.equal(cardNode(run([OPEN, at('a'), at('b'), pin('b')])), 'b');
});

void test('open, hover, close, reopen: no card', (): void => {
  const hovered: CardState = run([OPEN, at('thick_skin')]);
  assert.equal(cardNode(run([CLOSE, OPEN], hovered)), null);
  assert.equal(cardNode(run([CLOSE, OPEN], run([pin('thick_skin')], hovered))), null);
});

void test('nothing the pointer does while the tree is closed reaches the card', (): void => {
  const closed: CardState = run([at('thick_skin'), pin('thick_skin')]);
  assert.equal(cardNode(closed), null);
  assert.equal(cardNode(run([OPEN], closed)), null);
});
