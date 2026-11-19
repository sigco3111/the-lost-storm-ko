import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NameMood } from '../backend/api.ts';
import { nameProblem } from './lobby-model.ts';
import { BYNAMES, drawFree, EITHER_NAMES, GIVEN_NAMES, localNames, MOOD_LINES, moodAt, MOODS, nameKey, nearNames } from './name-pool.ts';

void test('the hour of the player\'s own clock sets the mood', (): void => {
  const moods: readonly NameMood[] = Array.from({ length: 24 }, (_unused: unknown, hour: number): NameMood => moodAt(hour));
  assert.deepEqual(moods.slice(0, 5), ['small-hours', 'small-hours', 'small-hours', 'small-hours', 'small-hours']);
  assert.deepEqual(moods.slice(5, 8), ['dawn', 'dawn', 'dawn']);
  assert.ok(moods.slice(8, 17).every((mood: NameMood): boolean => mood === 'day'));
  assert.deepEqual(moods.slice(17, 21), ['dusk', 'dusk', 'dusk', 'dusk']);
  assert.deepEqual(moods.slice(21), ['night', 'night', 'night']);
});

void test('every local name is two plain words the name rules accept, thousands in all', (): void => {
  let total: number = 0;
  for (const mood of MOODS) {
    for (const body of ['man', 'woman'] as const) {
      const names: readonly string[] = localNames(body, mood);
      assert.ok(names.length > 800, `${body} ${mood} has ${names.length}`);
      total += names.length;
      for (const name of names) {
        assert.equal(nameProblem(name), null, name);
        assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
        assert.ok(BYNAMES[mood].includes(name.split(' ')[1] ?? ''), name);
      }
    }
    assert.ok(MOOD_LINES[mood].length > 0);
  }
  assert.ok(total > 9000, `${total}`);
});

void test('a man is never offered a woman\'s given name, and the other way round', (): void => {
  const either: ReadonlySet<string> = new Set<string>(EITHER_NAMES);
  for (const name of localNames('man', 'day')) assert.ok(!GIVEN_NAMES.woman.includes(name.split(' ')[0] ?? '') || either.has(name.split(' ')[0] ?? ''), name);
  for (const name of localNames('woman', 'day')) assert.ok(!GIVEN_NAMES.man.includes(name.split(' ')[0] ?? ''), name);
});

void test('no word is used twice across the lists', (): void => {
  const givens: readonly string[] = [...GIVEN_NAMES.man, ...GIVEN_NAMES.woman, ...EITHER_NAMES];
  const bynames: readonly string[] = MOODS.flatMap((mood: NameMood): readonly string[] => BYNAMES[mood]);
  assert.equal(new Set(givens).size, givens.length);
  assert.equal(new Set(bynames).size, bynames.length);
});

void test('a draw skips refused names in any case or spacing, and gives up only when none is left', (): void => {
  const names: readonly string[] = ['Edda Morrow', 'Tobin Lark'];
  assert.equal(drawFree(names, (): number => 0, new Set<string>([nameKey('EDDA Morrow')])), 'Tobin Lark');
  assert.equal(drawFree(names, (): number => 0.9999, new Set<string>()), 'Tobin Lark');
  assert.equal(drawFree(names, (): number => 0, new Set<string>(names.map(nameKey))), null);
});

void test('a name close to a typed one keeps what was typed and only fits within the length', (): void => {
  for (const name of nearNames('Corvin', 'dusk')) assert.match(name, /^Corvin [A-Z][a-z]+$/);
  assert.equal(nearNames('Corvin', 'dusk').length, BYNAMES.dusk.length);
  assert.deepEqual(nearNames('Bartholomew Ash', 'dusk'), []);
});

void test('with no hero picked yet, the local pool holds only given names that suit either hero', (): void => {
  for (const mood of MOODS) {
    const names: readonly string[] = localNames(null, mood);
    assert.ok(names.length > 0);
    for (const name of names) assert.ok(EITHER_NAMES.includes(name.split(' ')[0] ?? ''));
    for (const name of names) assert.ok(!GIVEN_NAMES.man.includes(name.split(' ')[0] ?? '') && !GIVEN_NAMES.woman.includes(name.split(' ')[0] ?? ''));
  }
});
