import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Buffered, PressBuffer, PressRank, Taken } from './press-buffer.ts';
import { bufferPress, EMPTY_BUFFER, isEmpty, PRESS_BUFFER, takePress } from './press-buffer.ts';
import type { Command, SkillCommand } from './types.ts';

const AIM = { x: 1, z: 2 } as const;

function skill(slot: number): SkillCommand {
  return { type: 'skill', slot, aim: AIM, targetId: null };
}

const DODGE: Command = skill(5);
const ATTACK: Command = skill(0);
const OTHER: Command = skill(1);
const CLICK: Command = { type: 'move', held: false, dest: AIM };
const DRAG: Command = { type: 'move', held: true, dest: AIM };

function press(command: Command, rank: PressRank, at: number): Buffered {
  return { command, rank, at };
}

const ALWAYS = (): boolean => true;
const NEVER = (): boolean => false;

function drain(buffer: PressBuffer, now: number): Command[] {
  const fired: Command[] = [];
  let rest: PressBuffer = buffer;
  for (let guard: number = 0; guard < 4; guard += 1) {
    const taken: Taken = takePress(rest, now, ALWAYS);
    rest = taken.rest;
    if (taken.press === null) break;
    fired.push(taken.press.command);
  }
  return fired;
}

void test('mashing one key buffers it once, with the aim of the latest press, and it fires once', (): void => {
  let buffer: PressBuffer = EMPTY_BUFFER;
  for (let step: number = 0; step < 6; step += 1) buffer = bufferPress(buffer, press({ ...skill(0), aim: { x: step, z: 0 } }, 'skill', step * 0.05));
  const fired: Command[] = drain(buffer, 0.3);
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0], { ...skill(0), aim: { x: 5, z: 0 } });
});

void test('a dodge pressed after a buffered skill overrides it; a skill pressed after a buffered dodge waits behind it', (): void => {
  const overridden: PressBuffer = bufferPress(bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0)), press(DODGE, 'dodge', 0.1));
  assert.deepEqual(drain(overridden, 0.2), [DODGE]);
  const behind: PressBuffer = bufferPress(bufferPress(EMPTY_BUFFER, press(DODGE, 'dodge', 0)), press(ATTACK, 'skill', 0.1));
  assert.deepEqual(drain(behind, 0.2), [DODGE, ATTACK]);
});

void test('the latest skill press wins over an older one on another key', (): void => {
  const buffer: PressBuffer = bufferPress(bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0)), press(OTHER, 'skill', 0.1));
  assert.deepEqual(drain(buffer, 0.2), [OTHER]);
});

void test('a fresh click to move drops a buffered skill; a held drag, a walk or a stop leaves it', (): void => {
  assert.deepEqual(drain(bufferPress(bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0)), press(CLICK, 'move', 0.1)), 0.2), [CLICK]);
  assert.deepEqual(drain(bufferPress(bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0)), press(DRAG, 'move', 0.1)), 0.2), [ATTACK, DRAG]);
  const walk: Command = { type: 'walk', held: true, dest: AIM };
  assert.deepEqual(drain(bufferPress(bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0)), press(walk, 'move', 0.1)), 0.2), [ATTACK, walk]);
  const stop: Command = { type: 'stop' };
  assert.deepEqual(drain(bufferPress(bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0)), press(stop, 'move', 0.1)), 0.2), [ATTACK, stop]);
});

void test('a skill or a dodge pressed after a buffered move drops it; a dodge never drops a skill pressed after it', (): void => {
  assert.deepEqual(drain(bufferPress(bufferPress(EMPTY_BUFFER, press(CLICK, 'move', 0)), press(ATTACK, 'skill', 0.1)), 0.2), [ATTACK]);
  assert.deepEqual(drain(bufferPress(bufferPress(EMPTY_BUFFER, press(CLICK, 'move', 0)), press(DODGE, 'dodge', 0.1)), 0.2), [DODGE]);
});

void test('a buffered skill or dodge older than the stale limit never fires; a buffered move never goes stale', (): void => {
  const buffer: PressBuffer = bufferPress(EMPTY_BUFFER, press(ATTACK, 'skill', 0));
  assert.deepEqual(drain(buffer, PRESS_BUFFER.stale - 0.01), [ATTACK]);
  const late: Taken = takePress(bufferPress(buffer, press(DODGE, 'dodge', 0)), PRESS_BUFFER.stale + 0.01, ALWAYS);
  assert.equal(late.press, null);
  assert.ok(isEmpty(late.rest));
  assert.deepEqual(drain(bufferPress(EMPTY_BUFFER, press(CLICK, 'move', 0)), PRESS_BUFFER.stale * 10), [CLICK]);
});

void test('a press the hero cannot take yet waits a short while and holds lower presses back, then is handed over anyway so its reason shows', (): void => {
  const buffer: PressBuffer = bufferPress(bufferPress(EMPTY_BUFFER, press(DODGE, 'dodge', 0)), press(ATTACK, 'skill', 0.05));
  const early: Taken = takePress(buffer, PRESS_BUFFER.wait - 0.01, NEVER);
  assert.equal(early.press, null);
  assert.deepEqual(early.rest, buffer);
  const later: Taken = takePress(early.rest, PRESS_BUFFER.wait + 0.01, NEVER);
  assert.equal(later.press?.command, DODGE);
  const next: Taken = takePress(later.rest, PRESS_BUFFER.wait + 0.01, ALWAYS);
  assert.equal(next.press?.command, ATTACK);
  assert.ok(isEmpty(next.rest));
});

void test('every press taken leaves the buffer, so none fires twice', (): void => {
  let buffer: PressBuffer = EMPTY_BUFFER;
  buffer = bufferPress(buffer, press(DODGE, 'dodge', 0));
  buffer = bufferPress(buffer, press(ATTACK, 'skill', 0.02));
  buffer = bufferPress(buffer, press(DRAG, 'move', 0.04));
  const fired: Command[] = drain(buffer, 0.1);
  assert.deepEqual(fired, [DODGE, ATTACK, DRAG]);
  assert.equal(new Set(fired).size, fired.length);
});
