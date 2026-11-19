import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guideData } from '../data.ts';
import { gapRows } from './combat.ts';

void test('enemies at your level give all their experience, and far ones give less', (): void => {
  const rows: readonly string[][] = gapRows(guideData());
  assert.equal(rows[0]?.[1], '100%');
  const shares: readonly number[] = rows.map((row: readonly string[]): number => Number.parseInt(row[1] ?? '0', 10));
  for (let index = 1; index < shares.length; index += 1) assert.ok((shares[index] ?? 0) <= (shares[index - 1] ?? 0));
});
