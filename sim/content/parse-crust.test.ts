import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from './read.ts';
import { bodyCrust, CRUST_LIMITS } from './parse-crust.ts';

void test('a body crust reads its plates, seam, glow strength and rim', (): void => {
  assert.deepEqual(bodyCrust({ cells: 5, seam: 0.08, strength: 2, rim: 0.4 }, 'monster.crust'), { cells: 5, seam: 0.08, strength: 2, rim: 0.4 });
  assert.equal(bodyCrust({ cells: 3, seam: 0.1, strength: 1, rim: 0 }, 'monster.crust').rim, 0);
});

void test('a crust with no seam, a seam wider than the limit, no plates or no glow is refused', (): void => {
  assert.throws((): unknown => bodyCrust({ cells: 5, seam: 0, strength: 2, rim: 0 }, 'monster.crust'), ContentError);
  assert.throws((): unknown => bodyCrust({ cells: 5, seam: CRUST_LIMITS.widestSeam + 0.01, strength: 2, rim: 0 }, 'monster.crust'), ContentError);
  assert.throws((): unknown => bodyCrust({ cells: 0, seam: 0.1, strength: 2, rim: 0 }, 'monster.crust'), ContentError);
  assert.throws((): unknown => bodyCrust({ cells: 5, seam: 0.1, strength: 0, rim: 0 }, 'monster.crust'), ContentError);
  assert.throws((): unknown => bodyCrust({ cells: 5, seam: 0.1, strength: 2 }, 'monster.crust'), ContentError);
});
