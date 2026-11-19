import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import type { Holds, Later } from './hit-hold.ts';
import { createHolds, createLater, heroHolds, HOLD, holdRate, holdSpan, rehold, RIPPLE, rippleDelays } from './hit-hold.ts';

const FRAME: number = 1 / 60;
const content: Content = loadContent();

function skill(id: string): SkillDef {
  const found: SkillDef | undefined = content.skills.get(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
}

void test('a hit holds for 40 to 80 ms taken from the skill, longer on a crit or a kill, and not at all with no hitStop', (): void => {
  assert.equal(holdSpan(0, true, true), 0);
  assert.equal(holdSpan(0.01, false, false), HOLD.min);
  assert.equal(holdSpan(0.12, true, true), HOLD.max);
  assert.ok(holdSpan(0.05, true, false) > holdSpan(0.05, false, false));
  assert.ok(holdSpan(0.05, false, true) > holdSpan(0.05, false, false));
  for (let stop: number = 0.01; stop <= 0.12; stop += 0.01) {
    const span: number = holdSpan(stop, true, true);
    assert.ok(span >= HOLD.min && span <= HOLD.max);
  }
});

void test('a held actor slows to a crawl, never to zero, then eases back to full speed without a jump', (): void => {
  const span: number = 0.06;
  assert.equal(holdRate({ span, age: 0 }), HOLD.floor);
  assert.ok(holdRate({ span, age: span / 2 }) > 0);
  assert.equal(holdRate({ span, age: span + HOLD.release }), 1);
  let previous: number = holdRate({ span, age: 0 });
  for (let age: number = 0; age <= span + HOLD.release + FRAME; age += FRAME / 4) {
    const rate: number = holdRate({ span, age });
    assert.ok(rate >= previous - 1e-12);
    assert.ok(rate - previous < 0.35);
    previous = rate;
  }
});

void test('a monster struck again soon after a hold is not held again, so ticks through a pack never keep it frozen', (): void => {
  const first = rehold(undefined, 0.06);
  assert.deepEqual(first, { span: 0.06, age: 0 });
  assert.deepEqual(rehold({ span: 0.05, age: 0.01 }, 0.08), { span: 0.08, age: 0.01 });
  assert.deepEqual(rehold({ span: 0.05, age: 0.1 }, 0.08), { span: 0.05, age: 0.1 });
  assert.deepEqual(rehold({ span: 0.05, age: HOLD.again }, 0.08), { span: 0.08, age: 0 });
  const holds: Holds = createHolds();
  let held: number = 0;
  for (let frame: number = 0; frame < 120; frame += 1) {
    if (frame % 3 === 0) holds.hold(7, 0.06);
    holds.step(FRAME);
    if (holds.rate(7) <= HOLD.floor) held += 1;
  }
  assert.ok(held < 120 / 3, `held ${held} of 120 frames`);
  assert.equal(holds.rate(8), 1);
});

void test('only heavy melee holds the hero swing', (): void => {
  const heavy: SkillDef = { ...skill('cleave'), hitStop: HOLD.heavy };
  assert.equal(heroHolds(heavy), true);
  assert.equal(heroHolds({ ...heavy, hitStop: HOLD.heavy / 2 }), false);
  const shot: SkillDef = [...content.skills.values()].find((one: SkillDef): boolean => one.delivery.type === 'projectile') ?? heavy;
  assert.equal(heroHolds({ ...shot, hitStop: 0.12 }), shot.delivery.type === 'arc');
});

void test('deaths in one volley ripple outward from the hero over a few frames, capped', (): void => {
  const delays = rippleDelays(
    [
      { id: 1, pos: { x: 2, z: 0 } },
      { id: 2, pos: { x: 4, z: 0 } },
      { id: 3, pos: { x: 40, z: 0 } },
    ],
    { x: 0, z: 0 },
  );
  assert.equal(delays.get(1), 0);
  assert.ok((delays.get(2) ?? 0) > 0 && (delays.get(2) ?? 0) < (delays.get(3) ?? 0));
  assert.equal(delays.get(3), RIPPLE.max);
  assert.equal(rippleDelays([], { x: 0, z: 0 }).size, 0);
});

void test('a later queue hands each item back once its delay has run, and can drop one', (): void => {
  const later: Later<number> = createLater<number>();
  later.add(0, 1);
  later.add(0.05, 2);
  later.add(0.05, 3);
  assert.deepEqual(later.take(0), [1]);
  later.drop((item: number): boolean => item !== 3);
  assert.deepEqual(later.take(0.03), []);
  assert.deepEqual(later.take(0.03), [2]);
  later.add(1, 4);
  later.clear();
  assert.deepEqual(later.take(2), []);
});
