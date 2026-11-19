import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAVE_LAYOUT } from './layout.ts';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { caveProblems, screenLoad } from './checks.ts';
import type { CaveRequest, ScreenLimit } from './generate.ts';
import type { CaveKit } from './kit.ts';
import { readKit } from './kit.ts';
import type { MadeResult } from './make.ts';
import { makeCave } from './make.ts';
import type { CaveNaming } from './zone.ts';

const content: Content = loadContent();
const kit: CaveKit = readKit(hourfall, 'hourfall');
const reference: ZoneDef | undefined = content.zones.get('under_hall');
assert.ok(reference !== undefined);
const limit: ScreenLimit = screenLoad(content, reference);
const naming: CaveNaming = { id: 'cave_test', name: 'Test cave', up: { id: 'up', to: 'under_hall', toExit: 'lair', requires: [], lockedHint: '', hiddenWhenLocked: false }, down: { id: 'down', to: 'under_hall', toExit: 'lair', requires: [], lockedHint: '', hiddenWhenLocked: false } };

function request(seed: number): CaveRequest {
  return { seed, columns: 110, rows: 110, chambers: 10, levels: { from: 14, to: 17 }, packs: 20, packScale: 1, roomScale: 1, top: CAVE_LAYOUT.top, ranks: [], screen: limit };
}

void test('over many seeds every cave the maker keeps passes the cave checks: every walkable cell reached from the entrance, the way down and the waypoint reached, packs apart and quiet at every safe point, nothing blocking an exit, no screen fuller than Hourfall Caves', (): void => {
  for (const seed of [1, 2, 3]) {
    const made: MadeResult = makeCave(content, kit, request(seed), naming);
    assert.ok(made.ok, made.ok ? '' : `seed ${seed}: ${made.problem}`);
    assert.deepEqual(caveProblems(content, made.cave.zone, limit), [], `seed ${seed}`);
    assert.equal(made.cave.zone.id, 'cave_test');
  }
});

void test('the maker gives up with the reason when no layout passes', (): void => {
  const made: MadeResult = makeCave(content, kit, { ...request(1), screen: { monsters: 1, lights: 0 } }, naming);
  assert.equal(made.ok, false);
});

void test('a kit naming a monster the game lacks is refused with its name before any cave is made', (): void => {
  const stranger: CaveKit = { ...kit, families: [...kit.families, { members: [{ monster: 'no_such_monster', count: 1 }], waits: null }] };
  const made: MadeResult = makeCave(content, stranger, request(1), naming);
  assert.ok(!made.ok && made.problem.includes('no_such_monster'));
});

void test('over many seeds a rect kit with rows of columns makes halls that pass the same cave checks', (): void => {
  const halls: CaveKit = readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 6, inset: 3, sides: ['long'] }], zone: { ...hourfall.zone, terrain: { ...hourfall.zone.terrain, rough: null } } }, 'halls');
  for (const seed of [1, 2]) {
    const made: MadeResult = makeCave(content, halls, request(seed), naming);
    assert.ok(made.ok, made.ok ? '' : `seed ${seed}: ${made.problem}`);
    assert.deepEqual(caveProblems(content, made.cave.zone, limit), [], `seed ${seed}`);
    assert.ok(made.cave.zone.props.some((placed): boolean => placed.prop === 'hall_column'), `seed ${seed} has no columns`);
  }
});

void test('a cave whose deepest packs are named rare and magic passes the cave and content checks', (): void => {
  for (const seed of [1]) {
    const made: MadeResult = makeCave(content, kit, { ...request(seed), ranks: [{ rank: 'rare', share: 0.25 }, { rank: 'magic', share: 0.25 }] }, naming);
    assert.ok(made.ok, made.ok ? '' : `seed ${seed}: ${made.problem}`);
    assert.deepEqual(caveProblems(content, made.cave.zone, limit), [], `seed ${seed}`);
    assert.equal(made.cave.zone.packs.filter((pack): boolean => pack.rank === 'rare').length, 5);
  }
  const unknown: MadeResult = makeCave(content, kit, { ...request(1), ranks: [{ rank: 'mythic', share: 0.1 }] }, naming);
  assert.ok(!unknown.ok && unknown.problem.includes('unknown rank mythic'), unknown.ok ? 'made' : unknown.problem);
});
