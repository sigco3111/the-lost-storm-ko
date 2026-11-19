import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GapFinding } from '../sim/world/zone-gaps.ts';
import type { CaveOptions } from './cave-generate.ts';
import { attachedOptions, caveOptions, fillNotch, formatZone, repairScope } from './cave-generate.ts';

void test('the command line names the zone, its doors and its band, and a gated way down waits for a visit', (): void => {
  const options: CaveOptions = caveOptions(['--id', 'deep', '--name', 'Deep', '--up', 'above:down', '--down', 'below:up', '--down-gate', 'below', '--from', '14', '--to', '17', '--seed', '5', '--packs', '30']);
  assert.equal(options.id, 'deep');
  assert.equal(options.seed, 5);
  assert.deepEqual(options.request.levels, { from: 14, to: 17 });
  assert.equal(options.request.packs, 30);
  assert.deepEqual(options.request.ranks, []);
  assert.deepEqual(caveOptions(['--id', 'deep', '--up', 'above:down', '--from', '14', '--to', '17', '--ranks', 'rare:0.2,magic:0.35']).request.ranks, [{ rank: 'rare', share: 0.2 }, { rank: 'magic', share: 0.35 }]);
  assert.deepEqual(options.up, { id: 'up', to: 'above', toExit: 'down', requires: [], lockedHint: '', hiddenWhenLocked: false });
  assert.deepEqual(options.down?.requires, [{ type: 'visited', zone: 'below', not: false }]);
  assert.throws((): CaveOptions => caveOptions(['--id', 'deep']));
  assert.throws((): CaveOptions => caveOptions(['--id', 'deep', '--up', 'above']));
});

void test('a command line with no band, no packs, a band that falls, too many chambers or no seeds is refused before any cave is made', (): void => {
  const base: readonly string[] = ['--id', 'deep', '--up', 'above:down'];
  assert.throws((): CaveOptions => caveOptions([...base, '--to', '17']), /--from and --to/);
  assert.throws((): CaveOptions => caveOptions([...base, '--from', '14', '--to', '17', '--packs', '0']), /at least one pack/);
  assert.throws((): CaveOptions => caveOptions([...base, '--from', '17', '--to', '14']), /level band/);
  assert.throws((): CaveOptions => caveOptions([...base, '--from', '14', '--to', '17', '--chambers', '16']), /chambers/);
  assert.throws((): CaveOptions => caveOptions([...base, '--from', '14', '--to', '17', '--seeds', '0']), /--seeds/);
  assert.throws((): CaveOptions => caveOptions([...base, '--from', '14', '--to', '17', '--ranks', 'rare']), /--ranks/);
  assert.throws((): CaveOptions => caveOptions([...base, '--from', '14', '--to', '17', '--ranks', 'rare:0.7,magic:0.7']), /rank shares/);
});

void test('a written zone reads back as the same record, one list entry per line', (): void => {
  const record: Record<string, unknown> = { id: 'deep', tiles: ['cc', 'c '], terrain: { rise: 1, levels: ['00', '0/'] }, packs: [{ x: 1, z: 2 }], exits: [] };
  const text: string = formatZone(record);
  assert.deepEqual(JSON.parse(text), record);
  assert.ok(text.includes('\n    "c "'));
  assert.ok(text.includes('"levels": [\n    "00",'));
});

void test('a wing is attached at a zone exit: it takes the zone as its id, starts at the level the exit stands on, and refuses more chambers than fit below it', (): void => {
  const options: CaveOptions = caveOptions(['--attach', 'upper:down', '--from', '12', '--to', '13', '--chambers', '6']);
  assert.deepEqual(options.attach, { zone: 'upper', exit: 'down' });
  assert.equal(options.id, 'upper');
  const host: Record<string, unknown> = { cellSize: 2, tiles: ['  ', ' c'], terrain: { levels: ['uu', 'ub'] }, exits: [{ id: 'down', x: 3, z: 3 }] };
  assert.equal(attachedOptions(options, host, { zone: 'upper', exit: 'down' }).request.top, 11);
  assert.throws((): CaveOptions => attachedOptions({ ...options, request: { ...options.request, chambers: 7 } }, host, { zone: 'upper', exit: 'down' }), /2 to 6 chambers/);
  assert.throws((): CaveOptions => attachedOptions(options, host, { zone: 'upper', exit: 'cellar' }), /no exit cellar/);
  assert.throws((): CaveOptions => caveOptions(['--attach', 'upper', '--from', '12', '--to', '13']), /--attach takes zone:exit/);
});

function notch(x: number): GapFinding {
  return { kind: 'pocket', x, z: 3, length: 0, area: 0, prop: null };
}

void test('gap repairs on an attached wing never fill a cell inside the host map or count the host props as theirs', (): void => {
  const host: Record<string, unknown> = { tiles: ['ccc', 'c c', 'ccc'], props: [{ prop: 'stone' }, { prop: 'stone' }] };
  assert.deepEqual(repairScope(host), { props: 2, columns: 3, rows: 3 });
  assert.deepEqual(repairScope(null), { props: 0, columns: 0, rows: 0 });
  const record: Record<string, unknown> = { tiles: ['cccccc', 'c cc c', 'cccccc'], terrain: { levels: ['bbbbbb', 'b bb b', 'bbbbbb'] } };
  assert.equal(fillNotch(record, 2, notch(3), { props: 2, columns: 3, rows: 3 }), false);
  assert.equal(fillNotch(record, 2, notch(9), { props: 2, columns: 3, rows: 3 }), true);
  assert.deepEqual(record['tiles'], ['cccccc', 'c cccc', 'cccccc']);
});
