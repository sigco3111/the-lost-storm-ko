import assert from 'node:assert/strict';
import { test } from 'node:test';
import life from '../../data/life.json' with { type: 'json' };
import { loadContent } from '../../sim/content/content.ts';
import { ContentError } from '../../sim/content/read.ts';
import { must } from '../../test/support.ts';
import { placesFor, readLife } from './life-kinds.ts';
import type { LifeGroup, LifeKind, LifeRules } from './life-kinds.ts';

void test('the small life in data reads, every group names a kind, and every place names a zone of the world', (): void => {
  const rules: LifeRules = readLife(life);
  assert.ok(rules.kinds.size > 0);
  const zones: ReadonlySet<string> = new Set<string>(loadContent().zones.keys());
  for (const place of rules.places) assert.ok(zones.has(place.zone), `unknown zone ${place.zone}`);
  assert.ok(placesFor(rules, 'between', 'shore').length > 0);
  assert.deepEqual(placesFor(rules, 'between', 'zone'), []);
});

void test('the caves hold bat roosts in zone coordinates, and a bat reads its flight and roosting numbers', (): void => {
  const rules: LifeRules = readLife(life);
  const roosts: readonly LifeGroup[] = placesFor(rules, 'under_hall', 'zone');
  assert.ok(roosts.length >= 6);
  for (const roost of roosts) assert.equal(rules.kinds.get(roost.kind)?.form, 'bat');
  const bat: LifeKind | undefined = rules.kinds.get('bat');
  assert.ok(bat !== undefined && bat.form === 'bat' && bat.most <= 4 && bat.wake > 0 && bat.cross > 0);
});

void test('a group of an unknown kind, a broken count or an unknown form is refused', (): void => {
  const kinds: readonly Record<string, unknown>[] = [{ id: 'crow', form: 'bird', size: 0.5, colour: '#333333', flee: 6, speed: 6, circleRadius: 6, circleHeight: 7, circleSpeed: 0.5, settle: 4, flapRate: 3 }];
  const place = (groups: unknown): unknown => ({ kinds, places: [{ zone: 'between', frame: 'shore', groups }] });
  assert.throws((): unknown => readLife(place([{ kind: 'owl', x: 0, z: 0, count: 2 }])), (error: unknown): boolean => error instanceof ContentError && error.message.includes('owl'));
  assert.throws((): unknown => readLife(place([{ kind: 'crow', x: 0, z: 0, count: 1.5 }])), (error: unknown): boolean => error instanceof ContentError && error.message.includes('count'));
  assert.throws((): unknown => readLife({ kinds: [{ ...must(kinds[0], 'kind'), form: 'fish' }], places: [] }), (error: unknown): boolean => error instanceof ContentError && error.message.includes('form'));
  assert.equal(must(readLife(place([{ kind: 'crow', x: 1, z: 2, count: 2 }])).places[0], 'place').groups[0]?.habit, 'perch');
});
