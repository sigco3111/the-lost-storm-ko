import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FakeClock } from '../../test/backend-support.ts';
import { createFakeClock } from '../../test/backend-support.ts';
import { CARD_PRESENCE, glidesFrom, HIDDEN_PRESENCE, stepPresence, viewIsMoving } from './tree-card.ts';
import type { CardPresence } from './tree-card.ts';

interface Scene {
  readonly clock: FakeClock;
  presence: CardPresence;
  movedAt: number;
  open: boolean;
  tick(wanted: string | null): CardPresence;
  move(): void;
  wait(ms: number): void;
}

function scene(): Scene {
  const clock: FakeClock = createFakeClock();
  const made: Scene = {
    clock,
    presence: HIDDEN_PRESENCE,
    movedAt: Number.NEGATIVE_INFINITY,
    open: true,
    tick(wanted: string | null): CardPresence {
      made.presence = stepPresence(made.presence, { now: clock.read(), open: made.open, wanted, movedAt: made.movedAt });
      return made.presence;
    },
    move(): void {
      made.movedAt = clock.read();
    },
    wait(ms: number): void {
      clock.now += ms;
    },
  };
  return made;
}

void test('a card shows when the pointer rests on a node and the view is still', (): void => {
  const world: Scene = scene();
  const shown: CardPresence = world.tick('squall');
  assert.equal(shown.visible, true);
  assert.equal(shown.node, 'squall');
});

void test('the card is hidden the moment the view moves and keeps its content to ease out', (): void => {
  const world: Scene = scene();
  world.tick('squall');
  world.move();
  const hidden: CardPresence = world.tick('squall');
  assert.equal(hidden.visible, false);
  assert.equal(hidden.node, 'squall');
});

void test('the card stays hidden while the view keeps moving, even with the pointer on a node', (): void => {
  const world: Scene = scene();
  world.tick('squall');
  for (let step: number = 0; step < 10; step += 1) {
    world.move();
    world.wait(16);
    assert.equal(world.tick('squall').visible, false);
  }
});

void test('the card returns only after the view has been still for the still period', (): void => {
  const world: Scene = scene();
  world.tick('squall');
  world.move();
  world.wait(CARD_PRESENCE.stillMs - 1);
  assert.equal(world.tick('squall').visible, false);
  world.wait(1);
  assert.equal(world.tick('squall').visible, true);
});

void test('a view that moved while no card was wanted shows a card only once it is still', (): void => {
  const world: Scene = scene();
  world.move();
  assert.equal(world.tick('b').visible, false);
  assert.equal(world.tick(null).visible, false);
  world.wait(CARD_PRESENCE.stillMs);
  assert.equal(world.tick('b').visible, true);
});

void test('moving from one node to the next keeps the card visible and refills it', (): void => {
  const world: Scene = scene();
  world.tick('a');
  const next: CardPresence = world.tick('b');
  assert.equal(next.visible, true);
  assert.equal(next.node, 'b');
});

void test('a visible card glides to the next node when the view is still', (): void => {
  const world: Scene = scene();
  const first: CardPresence = world.tick('a');
  assert.equal(glidesFrom(first, Number.NEGATIVE_INFINITY, world.clock.read(), world.movedAt), true);
});

void test('a card that has been hidden since its fade ended appears in place with no glide', (): void => {
  const world: Scene = scene();
  assert.equal(glidesFrom(HIDDEN_PRESENCE, Number.NEGATIVE_INFINITY, world.clock.read(), world.movedAt), false);
  const hiddenAt: number = world.clock.read();
  world.wait(CARD_PRESENCE.fadeMs);
  assert.equal(glidesFrom(HIDDEN_PRESENCE, hiddenAt, world.clock.read(), world.movedAt), false);
});

void test('a card still fading out glides to the node that brings it back', (): void => {
  const world: Scene = scene();
  const hiddenAt: number = world.clock.read();
  world.wait(CARD_PRESENCE.fadeMs - 1);
  assert.equal(glidesFrom(HIDDEN_PRESENCE, hiddenAt, world.clock.read(), world.movedAt), true);
});

void test('a card never glides while the view moves', (): void => {
  const world: Scene = scene();
  const shown: CardPresence = world.tick('a');
  world.move();
  assert.equal(glidesFrom(shown, Number.NEGATIVE_INFINITY, world.clock.read(), world.movedAt), false);
  world.wait(CARD_PRESENCE.stillMs);
  assert.equal(glidesFrom(shown, Number.NEGATIVE_INFINITY, world.clock.read(), world.movedAt), true);
});

void test('leaving a node hides the card on the same step and keeps its content to fade', (): void => {
  const world: Scene = scene();
  world.tick('a');
  const gone: CardPresence = world.tick(null);
  assert.equal(gone.visible, false);
  assert.equal(gone.node, 'a');
});

void test('a card hidden by leaving a node stays hidden however long the pointer is away', (): void => {
  const world: Scene = scene();
  world.tick('a');
  world.tick(null);
  world.wait(1);
  assert.equal(world.tick(null).visible, false);
  world.wait(CARD_PRESENCE.stillMs * 4);
  assert.equal(world.tick(null).visible, false);
});

void test('crossing a gap to a close node hides the card in the gap and glides it in at the next node', (): void => {
  const world: Scene = scene();
  world.tick('a');
  const hiddenAt: number = world.clock.read();
  const gap: CardPresence = world.tick(null);
  assert.equal(gap.visible, false);
  world.wait(CARD_PRESENCE.fadeMs - 1);
  const arrived: CardPresence = world.tick('b');
  assert.equal(arrived.visible, true);
  assert.equal(arrived.node, 'b');
  assert.equal(glidesFrom(gap, hiddenAt, world.clock.read(), world.movedAt), true);
});

void test('a hidden card does not come back on its own when nothing is wanted', (): void => {
  const world: Scene = scene();
  world.tick('a');
  world.move();
  world.tick('a');
  world.wait(CARD_PRESENCE.stillMs * 4);
  assert.equal(world.tick(null).visible, false);
});

void test('a node that is wanted while hidden and moving is the one shown when the view settles', (): void => {
  const world: Scene = scene();
  world.tick('a');
  world.move();
  world.tick('a');
  world.tick('b');
  world.wait(CARD_PRESENCE.stillMs);
  const settled: CardPresence = world.tick('b');
  assert.equal(settled.visible, true);
  assert.equal(settled.node, 'b');
});

void test('closing the tree hides the card and forgets its node', (): void => {
  const world: Scene = scene();
  world.tick('a');
  world.open = false;
  assert.deepEqual(world.tick('a'), HIDDEN_PRESENCE);
});

void test('the view counts as moving for exactly the still period', (): void => {
  assert.equal(viewIsMoving(100, 100), true);
  assert.equal(viewIsMoving(100 + CARD_PRESENCE.stillMs - 1, 100), true);
  assert.equal(viewIsMoving(100 + CARD_PRESENCE.stillMs, 100), false);
  assert.equal(viewIsMoving(0, Number.NEGATIVE_INFINITY), false);
});
