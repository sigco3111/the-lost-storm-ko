import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Score } from '../../sim/content/audio.ts';
import type { DueNote } from './score.ts';
import { notesBetween, scoreSounds } from './score.ts';

const SCORE: Score = {
  length: 30,
  notes: [
    { sound: 'pad_low', at: 0, volume: 1, rate: 0.5, pan: 0 },
    { sound: 'pad_high', at: 12, volume: 0.4, rate: 1, pan: 0.5 },
    { sound: 'pad_low', at: 24, volume: 1, rate: 0.5, pan: -0.2 },
  ],
};

function times(due: readonly DueNote[]): readonly number[] {
  return due.map((entry: DueNote): number => entry.time);
}

void test('a window hands out the notes that fall inside it, at their place on the timeline', (): void => {
  assert.deepEqual(times(notesBetween(SCORE, 100, 100, 115)), [100, 112]);
  assert.deepEqual(times(notesBetween(SCORE, 100, 100.5, 112)), []);
});

void test('the score repeats at its length: a window across the end plays the last note and then the first again', (): void => {
  const due: readonly DueNote[] = notesBetween(SCORE, 0, 20, 35);
  assert.deepEqual(times(due), [24, 30]);
  assert.deepEqual(
    due.map((entry: DueNote): string => entry.note.sound),
    ['pad_low', 'pad_low'],
  );
  assert.deepEqual(times(notesBetween(SCORE, 0, 59, 61)), [60]);
});

void test('windows laid end to end over many passes play every note once and in order', (): void => {
  const played: number[] = [];
  for (let from: number = 0; from < 300; from += 2) played.push(...times(notesBetween(SCORE, 0, from, from + 2)));
  assert.equal(played.length, 30);
  assert.deepEqual(played, played.toSorted((a: number, b: number): number => a - b));
  assert.equal(new Set<number>(played).size, played.length);
});

void test('nothing is due before the score starts or in an empty window', (): void => {
  assert.deepEqual(notesBetween(SCORE, 50, 10, 40), []);
  assert.deepEqual(notesBetween(SCORE, 0, 10, 10), []);
});

void test('the sounds a score needs are listed once each, and no score needs none', (): void => {
  assert.deepEqual(scoreSounds(SCORE), ['pad_low', 'pad_high']);
  assert.deepEqual(scoreSounds(null), []);
});
