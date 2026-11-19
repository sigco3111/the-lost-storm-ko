import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import type { CaveFight, CaveRun } from './simulate-cave.ts';
import type { CaveRow } from './simulate-cave-table.ts';
import { caveRow, caveTable, median } from './simulate-cave-table.ts';

function run(seed: number, levelMinutes: Readonly<Record<string, number>>, deaths: number, farEndMinutes: number | null, fights: readonly CaveFight[]): CaveRun {
  return { job: { zone: 'under_hall', through: [], raise: 0, gear: [], enterLevel: 8, minutes: 30, skill: 'average', build: 'mixed', seed }, entered: true, enteredAtLevel: 8, levelMinutes, deaths, kills: 300, minutes: 30, farEndMinutes, clearMinutes: null, lowMinutes: 0, fights, deathsAt: [] };
}

void test('the median of an even count is the mean of the middle two', (): void => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([5]), 5);
  assert.equal(median([]), null);
});

void test('a row counts deaths per hour over every run and fights lost by pack rank', (): void => {
  const row: CaveRow = must(caveRow([
    run(1, { 10: 4, 12: 11, 14: 20 }, 1, 31, [{ rank: 'normal', level: 9, lost: false, seconds: 10 }, { rank: 'rare', level: 12, lost: true, seconds: 10 }]),
    run(2, { 10: 6, 12: 13 }, 0, null, [{ rank: 'normal', level: 9, lost: true, seconds: 10 }, { rank: 'magic', level: 10, lost: false, seconds: 10 }]),
  ]), 'row');
  assert.equal(row.deathsPerHour, 1);
  assert.equal(row.killsPerMinute, 10);
  assert.deepEqual(row.levelMinutes, [5, 12, 20]);
  assert.deepEqual(row.levelReached, [2, 2, 1]);
  assert.equal(row.farEnd, 31);
  assert.equal(row.farEndReached, 1);
  assert.deepEqual(row.lost, { normal: [2, 1], rare: [1, 1], magic: [1, 0] });
});

void test('the table marks a level or the far end that only some runs reached', (): void => {
  const row: CaveRow = must(caveRow([run(1, { 10: 4, 12: 11, 14: 20 }, 0, 31, []), run(2, { 10: 6, 12: 13 }, 0, null, [])]), 'row');
  const lines: string[] = caveTable([row]).split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '| mixed | average | 8 | 5 | 12 | 20 (1/2) | 0.0 | 10.0 | 31 (1/2) | normal 0/0, magic 0/0, rare 0/0 |');
});

void test('no runs make no row', (): void => {
  assert.equal(caveRow([]), null);
});
