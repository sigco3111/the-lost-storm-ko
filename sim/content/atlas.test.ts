import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { ATLAS_RULES, atlasProblems } from './atlas.ts';
import { loadContent } from './content.ts';
import type { ActDef, Content, MapPlace } from './types.ts';

const content: Content = loadContent();
const act: ActDef = must(content.world.acts[0], 'first act');

function withPlaces(places: readonly MapPlace[]): Content {
  return { ...content, world: { ...content.world, acts: [{ ...act, atlas: { ...act.atlas, places } }, ...content.world.acts.slice(1)] } };
}

void test('the shipped world map keeps every two places of an act apart', (): void => {
  assert.deepEqual(atlasProblems(content), []);
});

void test('two places closer than the gap are reported with their distance', (): void => {
  const [first, second, ...rest] = act.atlas.places;
  const anchor: MapPlace = must(first, 'first place');
  const near: MapPlace = { ...must(second, 'second place'), x: anchor.x + 40, y: anchor.y };
  const problems: string[] = atlasProblems(withPlaces([anchor, near, ...rest]));
  assert.ok(problems.includes(`act ${act.id} puts ${anchor.zone} and ${near.zone} 40 apart, closer than ${ATLAS_RULES.placeGap}`), problems.join('\n'));
});

void test('a map label may not be empty', (): void => {
  const [first, ...rest] = act.atlas.places;
  const blank: MapPlace = { ...must(first, 'first place'), label: ' ' };
  assert.ok(atlasProblems(withPlaces([blank, ...rest])).includes(`act ${act.id} gives zone ${blank.zone} an empty map label`));
});

void test('a place may only join a chain its act names', (): void => {
  const [first, ...rest] = act.atlas.places;
  const lost: MapPlace = { ...must(first, 'first place'), chain: 'nowhere' };
  assert.ok(atlasProblems(withPlaces([lost, ...rest])).includes(`act ${act.id} puts zone ${lost.zone} in unknown chain nowhere`));
});
