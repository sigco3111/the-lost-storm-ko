import assert from 'node:assert/strict';
import { test } from 'node:test';
import raw from '../../data/glitches.json' with { type: 'json' };
import { loadContent } from './content.ts';
import { must } from '../../test/support.ts';
import type { GlitchDef, GlitchStage } from './glitches.ts';
import { glitchKnownOf, glitchProblems, loadGlitches, parseGlitches } from './glitches.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

const content: Content = loadContent();

void test('the shipped glitches read cleanly and every quest they name exists', (): void => {
  const def: GlitchDef = loadGlitches();
  assert.deepEqual(glitchProblems(def, glitchKnownOf(content)), []);
  const first: GlitchStage = must(def.stages[0], 'first stage');
  assert.equal(first.from, 0);
  assert.deepEqual(first.kinds, ['stutter', 'wrong_word']);
});

void test('glitches that name a missing quest are reported', (): void => {
  const def: GlitchDef = parseGlitches({ ...raw, triggers: [{ id: 'x', kind: 'stutter', during: 'any', when: [{ type: 'quest', quest: 'no_quest', is: 'done' }] }] });
  assert.deepEqual(glitchProblems(def, glitchKnownOf(content)), ['glitches: unknown quest no_quest']);
});

void test('stages out of order, a bad template, or a bad kind are refused', (): void => {
  const [first, second] = raw.stages;
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [second, first] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, wrongWord: { names: [], template: 'no slots' } }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, kinds: ['explode'] }] }), ContentError);
});

void test('a stage with no kinds, or no wrong names, is refused', (): void => {
  const first = must(raw.stages[0], 'first stage');
  assert.throws((): GlitchDef => parseGlitches({ ...raw, stages: [{ ...first, kinds: [] }] }), ContentError);
  assert.throws((): GlitchDef => parseGlitches({ ...raw, wrongWord: { ...raw.wrongWord, names: [] } }), ContentError);
});
