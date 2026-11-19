import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { SkillDef } from '../content/types.ts';
import { movesHero, skillNumbers } from './skill-numbers.ts';

void test('every skill in the game reads as finite, non-negative numbers', (): void => {
  for (const skill of loadContent().skills.values()) {
    const numbers = skillNumbers(skill);
    for (const value of [numbers.reach, numbers.area, numbers.duration, numbers.count]) assert.ok(Number.isFinite(value) && value >= 0, skill.id);
  }
});

void test('only dashes and blinks move the hero', (): void => {
  const skills: SkillDef[] = [...loadContent().skills.values()];
  assert.ok(skills.some(movesHero));
  for (const skill of skills) assert.equal(movesHero(skill), skill.delivery.type === 'dash' || skill.delivery.type === 'blink');
});
