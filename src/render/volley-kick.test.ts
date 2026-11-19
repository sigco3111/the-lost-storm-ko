import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VolleyHit, VolleyKick } from './volley-kick.ts';
import { hitKick, VOLLEY, volleyAmount, volleyKicks } from './volley-kick.ts';

function pack(count: number, key: string, crit: boolean): VolleyHit[] {
  return Array.from({ length: count }, (_: unknown, index: number): VolleyHit => {
    const angle: number = (index / Math.max(1, count)) * 0.8 - 0.4;
    return { key, dirX: Math.sin(angle), dirZ: Math.cos(angle), crit, shake: 0.3 };
  });
}

void test('a volley through thirty monsters gives one camera kick, not thirty', (): void => {
  const kicks: VolleyKick[] = volleyKicks(pack(30, 'hero:millwheel', false));
  assert.equal(kicks.length, 1);
});

void test('the kick grows with the number hit but never past the old single-crit kick', (): void => {
  const one: number = volleyAmount(hitKick(0.3, false), 1);
  const five: number = volleyAmount(hitKick(0.3, false), 5);
  const forty: number = volleyAmount(hitKick(0.3, true), 40);
  assert.equal(one, hitKick(0.3, false));
  assert.ok(five > one);
  assert.ok(forty <= VOLLEY.ceiling);
  assert.equal(VOLLEY.ceiling, VOLLEY.punch * VOLLEY.crit);
  for (const kick of volleyKicks(pack(40, 'hero:cleave', true))) assert.ok(kick.amount <= VOLLEY.ceiling);
});

void test('two skills landing in the same batch each kick once, along the average hit direction', (): void => {
  const kicks: VolleyKick[] = volleyKicks([...pack(6, 'hero:cleave', false), ...pack(3, 'ally:bolt', false)]);
  assert.equal(kicks.length, 2);
  for (const kick of kicks) {
    assert.ok(Math.abs(Math.hypot(kick.dirX, kick.dirZ) - 1) < 1e-9);
    assert.ok(kick.dirZ > 0.9);
  }
});

void test('hits from every side still kick, along the first hit, and a skill with no shake does not kick', (): void => {
  const ring: VolleyHit[] = [
    { key: 'nova', dirX: 1, dirZ: 0, crit: false, shake: 0.3 },
    { key: 'nova', dirX: -1, dirZ: 0, crit: false, shake: 0.3 },
  ];
  const kicks: VolleyKick[] = volleyKicks(ring);
  assert.equal(kicks.length, 1);
  assert.equal(kicks[0]?.dirX, 1);
  assert.deepEqual(volleyKicks([{ key: 'calm', dirX: 0, dirZ: 1, crit: true, shake: 0 }]), []);
});
