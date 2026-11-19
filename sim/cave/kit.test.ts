import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import { loadContent } from '../content/content.ts';
import { ContentError, fields } from '../content/read.ts';
import type { Content } from '../content/types.ts';
import type { CaveKit } from './kit.ts';
import { readKit } from './kit.ts';

const content: Content = loadContent();
const kit: CaveKit = readKit(hourfall, 'hourfall');

void test('the Hourfall kit names only props, caches, monsters and surfaces the game has', (): void => {
  for (const cluster of kit.clusters) for (const piece of cluster) assert.ok(content.props.has(piece.prop), piece.prop);
  for (const cache of kit.caches) assert.notEqual(content.props.get(cache)?.cache ?? null, null, cache);
  assert.ok(content.props.has(kit.stairs.prop));
  for (const family of kit.families) for (const member of family.members) assert.ok(content.monsters.has(member.monster), member.monster);
  const floors = fields(kit.zone['floors'], 'floors');
  for (const surface of Object.values(floors)) assert.ok(typeof surface === 'string' && content.surfaces.has(surface), String(surface));
});

void test('a kit whose letters are not its floors, or that brings its own levels, is refused', (): void => {
  assert.throws((): CaveKit => readKit({ ...hourfall, letters: { ...hourfall.letters, passage: 'q' } }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, zone: { ...hourfall.zone, terrain: { ...hourfall.zone.terrain, levels: [] } } }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, families: [] }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, shape: { ...hourfall.shape, radiusMost: 1 } }, 'bad'), ContentError);
});

void test('a kit may build rect rooms with rows of props, and rows on round caves or with no side are refused', (): void => {
  const halls: CaveKit = readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 6, inset: 3, sides: ['long', 'aisle'] }] }, 'halls');
  assert.equal(halls.shape.form, 'rect');
  assert.deepEqual(halls.rows, [{ prop: 'hall_column', step: 6, inset: 3, sides: ['long', 'aisle'] }]);
  assert.equal(kit.shape.form, 'blob');
  assert.deepEqual(kit.rows, []);
  assert.throws((): CaveKit => readKit({ ...hourfall, rows: [{ prop: 'hall_column', step: 6, inset: 3, sides: ['long'] }] }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 6, inset: 3, sides: [] }] }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 0, inset: 3, sides: ['long'] }] }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 6, inset: -1, sides: ['long'] }] }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 6, inset: 3, sides: ['wall'] }] }, 'bad'), ContentError);
  assert.throws((): CaveKit => readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'oval' } }, 'bad'), ContentError);
});
