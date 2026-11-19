import assert from 'node:assert/strict';
import test from 'node:test';
import type { WatchEffect, WatchSignal, WatchState } from './frame-watch.ts';
import { FRAME_WATCH, nextWatch, startWatch } from './frame-watch.ts';

function run(signals: readonly WatchSignal[], from: WatchState = startWatch(0)): { readonly state: WatchState; readonly effects: WatchEffect[] } {
  let state: WatchState = from;
  const effects: WatchEffect[] = [];
  for (const signal of signals) {
    const next = nextWatch(state, signal);
    state = next.state;
    effects.push(...next.effects);
  }
  return { state, effects };
}

function checks(from: number, to: number, watching: boolean): WatchSignal[] {
  const out: WatchSignal[] = [];
  for (let at: number = from; at <= to; at += FRAME_WATCH.checkMs) out.push({ type: 'check', at, watching });
  return out;
}

void test('a world that keeps stepping is never re-armed and never offered a resume', (): void => {
  const signals: WatchSignal[] = [];
  for (let at: number = 0; at < 20000; at += 16) {
    signals.push({ type: 'stepped', at });
    if (at % FRAME_WATCH.checkMs < 16) signals.push({ type: 'check', at, watching: true });
  }
  assert.deepEqual(run(signals).effects, []);
});

void test('when frames stop in play in a visible tab the loop is re-armed first, then the resume line is offered', (): void => {
  const first = run(checks(0, FRAME_WATCH.stallMs, true));
  assert.deepEqual(first.effects, ['rearm']);
  const second = run(checks(FRAME_WATCH.stallMs + FRAME_WATCH.checkMs, FRAME_WATCH.stallMs * 2, true), first.state);
  assert.deepEqual(second.effects, ['offer']);
  const third = run(checks(FRAME_WATCH.stallMs * 2 + FRAME_WATCH.checkMs, FRAME_WATCH.stallMs * 5, true), second.state);
  assert.deepEqual(third.effects, []);
});

void test('a re-arm that brings the frames back never shows the resume line', (): void => {
  const stalled = run(checks(0, FRAME_WATCH.stallMs, true));
  const back = run([{ type: 'stepped', at: FRAME_WATCH.stallMs + 16 }, ...checks(FRAME_WATCH.stallMs + FRAME_WATCH.checkMs, FRAME_WATCH.stallMs * 3, false)], stalled.state);
  assert.deepEqual(back.effects, []);
  assert.equal(back.state.phase, 'quiet');
});

void test('a hidden tab, the title or a loading zone is not a stall, however long it lasts', (): void => {
  const away = run(checks(0, 600000, false));
  assert.deepEqual(away.effects, []);
  const back = run(checks(600000 + FRAME_WATCH.checkMs, 600000 + FRAME_WATCH.stallMs - 1, true), away.state);
  assert.deepEqual(back.effects, []);
});

void test('a step after the line was offered clears it, and leaving play clears it too', (): void => {
  const offered = run(checks(0, FRAME_WATCH.stallMs * 2, true));
  assert.equal(offered.state.phase, 'offered');
  assert.deepEqual(run([{ type: 'stepped', at: 9000 }], offered.state).effects, ['clear']);
  assert.deepEqual(run([{ type: 'check', at: 9000, watching: false }], offered.state).effects, ['clear']);
});

void test('pressing resume hides the line and re-arms, and offers it again only after another full stall', (): void => {
  const offered = run(checks(0, FRAME_WATCH.stallMs * 2, true));
  const resumed = run([{ type: 'resume', at: 7000 }], offered.state);
  assert.deepEqual(resumed.effects, ['clear', 'rearm']);
  assert.deepEqual(run(checks(8000, 7000 + FRAME_WATCH.stallMs - 1, true), resumed.state).effects, []);
  assert.deepEqual(run(checks(7000 + FRAME_WATCH.stallMs, 7000 + FRAME_WATCH.stallMs, true), resumed.state).effects, ['offer']);
});
