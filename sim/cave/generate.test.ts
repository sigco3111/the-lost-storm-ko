import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import { loadContent } from '../content/content.ts';
import { TERRAIN_MARKS } from '../content/terrain-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { screenLoad } from './checks.ts';
import type { CaveLayout, CavePack, CaveProp, CaveRequest, CaveResult, ScreenLimit } from './generate.ts';
import { CAVE_GEN, generateCave } from './generate.ts';
import type { CellBox } from './layout.ts';
import { CAVE_LAYOUT, chamberBox } from './layout.ts';
import type { CaveKit } from './kit.ts';
import { readKit } from './kit.ts';

const content: Content = loadContent();
const kit: CaveKit = readKit(hourfall, 'hourfall');
const reference: ZoneDef | undefined = content.zones.get('under_hall');
assert.ok(reference !== undefined);
const limit: ScreenLimit = screenLoad(content, reference);
const SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6];

function request(seed: number): CaveRequest {
  return { seed, columns: 110, rows: 110, chambers: 10, levels: { from: 14, to: 17 }, packs: 20, packScale: 1, roomScale: 1, top: CAVE_LAYOUT.top, ranks: [], screen: limit };
}

function made(seed: number): CaveLayout {
  const result: CaveResult = generateCave(request(seed), { kit, defs: content.props, judge: null });
  assert.ok(result.ok, result.ok ? '' : `seed ${seed}: ${result.problem}`);
  return result.layout;
}

const layouts: readonly CaveLayout[] = SEEDS.map(made);

void test('the same seed makes the same cave and another seed makes a different one', (): void => {
  assert.deepEqual(made(1), layouts[0]);
  assert.notDeepEqual(layouts[0]?.tiles, layouts[1]?.tiles);
});

void test('packs stand the cave spacing apart, at the band level for their depth, and the waypoint sits near the entrance', (): void => {
  for (const layout of layouts) {
    assert.equal(layout.packs.length, 20);
    layout.packs.forEach((pack, at: number): void => {
      assert.ok(pack.level >= 14 && pack.level <= 17);
      for (const other of layout.packs.slice(at + 1)) assert.ok(distance(pack, other) >= CAVE_GEN.packApart);
    });
    assert.ok(distance(layout.waypoint, layout.start) <= CAVE_GEN.waypointAway.most);
    assert.ok(distance(layout.descent, layout.entrance) > distance(layout.waypoint, layout.entrance));
  }
});

void test('each level change is one ramp with level ground at both ends and two stairs on it, and the level map marks it', (): void => {
  for (const layout of layouts) {
    assert.equal(layout.passages.length, layout.chambers.length - 1);
    assert.equal(layout.props.filter((placed): boolean => placed.prop === kit.stairs.prop).length, layout.passages.length * 2);
    for (const passage of layout.passages) {
      const { ramp } = passage;
      const step: number = ramp.start;
      const mark: string | undefined = ramp.axis === 'z' ? layout.levels[step]?.charAt(ramp.line) : layout.levels[ramp.line]?.charAt(step);
      assert.equal(mark, TERRAIN_MARKS.ramp);
    }
    assert.equal(layout.levels.length, layout.tiles.length);
  }
});

void test('more chambers than the terraces can hold, no packs, or a kit naming a prop the game lacks are refused with the reason', (): void => {
  const deep: CaveResult = generateCave({ ...request(1), chambers: 16 }, { kit, defs: content.props, judge: null });
  assert.ok(!deep.ok && deep.problem.includes('chambers'));
  const empty: CaveResult = generateCave({ ...request(1), packs: 0 }, { kit, defs: content.props, judge: null });
  assert.ok(!empty.ok && empty.problem.includes('pack'));
  const typo: CaveResult = generateCave(request(1), { kit: { ...kit, caches: [...kit.caches, 'no_such_cache'] }, defs: content.props, judge: null });
  assert.ok(!typo.ok && typo.problem.includes('no_such_cache'));
  const plain: CaveResult = generateCave(request(1), { kit: { ...kit, caches: [kit.stairs.prop] }, defs: content.props, judge: null });
  assert.ok(!plain.ok && plain.problem.includes('not caches'));
  const lostRow: CaveResult = generateCave(request(1), { kit: { ...kit, shape: { ...kit.shape, form: 'rect' }, rows: [{ prop: 'no_such_column', step: 6, inset: 3, sides: ['long'] }] }, defs: content.props, judge: null });
  assert.ok(!lostRow.ok && lostRow.problem.includes('no_such_column'));
});

void test('a cave too small for its chambers is refused, not squeezed', (): void => {
  const result: CaveResult = generateCave({ ...request(1), columns: 40, rows: 40 }, { kit, defs: content.props, judge: null });
  assert.equal(result.ok, false);
});

const halls: CaveKit = readKit({ ...hourfall, shape: { ...hourfall.shape, form: 'rect' }, rows: [{ prop: 'hall_column', step: 6, inset: 3, sides: ['long'] }], zone: { ...hourfall.zone, terrain: { ...hourfall.zone.terrain, rough: null } } }, 'halls');

function hall(seed: number): CaveLayout {
  const result: CaveResult = generateCave(request(seed), { kit: halls, defs: content.props, judge: null });
  assert.ok(result.ok, result.ok ? '' : `seed ${seed}: ${result.problem}`);
  return result.layout;
}

void test('a rect kit builds whole rectangular rooms at their own level, square corridors as wide as the ramp, and columns in even lines along the long walls', (): void => {
  for (const seed of SEEDS.slice(0, 4)) {
    const layout: CaveLayout = hall(seed);
    for (const chamber of layout.chambers) {
      const box: CellBox = chamberBox(chamber);
      for (let row: number = box.top; row <= box.bottom; row += 1) {
        for (let column: number = box.left; column <= box.right; column += 1) {
          assert.notEqual(layout.tiles[row]?.charAt(column), ' ', `seed ${seed} chamber ${chamber.index} cell ${column},${row}`);
          assert.equal(Number.parseInt(layout.levels[row]?.charAt(column) ?? '', 36), chamber.level, `seed ${seed} chamber ${chamber.index} cell ${column},${row}`);
        }
      }
    }
    for (const passage of layout.passages) {
      const { ramp } = passage;
      const ends: readonly (readonly [number, number])[] = [[ramp.start - ramp.sign * (CAVE_LAYOUT.lead + 1), layout.chambers[passage.from]?.level ?? -1], [ramp.start + ramp.sign * (ramp.length + CAVE_LAYOUT.lead), layout.chambers[passage.to]?.level ?? -1]];
      for (const [step, level] of ends) {
        for (let across: number = 0; across < ramp.width; across += 1) {
          const side: number = ramp.line - ramp.width / 2 + across;
          const mark: string | undefined = ramp.axis === 'z' ? layout.levels[step]?.charAt(side) : layout.levels[side]?.charAt(step);
          assert.equal(Number.parseInt(mark ?? '', 36), level, `seed ${seed} passage ${passage.from} corridor cell ${side} at ${step}`);
        }
      }
    }
    const columns: readonly CaveProp[] = layout.props.filter((placed: CaveProp): boolean => placed.prop === 'hall_column');
    const paired: number = columns.filter((placed: CaveProp): boolean => columns.some((other: CaveProp): boolean => (other.z === placed.z && Math.abs(Math.abs(other.x - placed.x) - 6) < 0.02) || (other.x === placed.x && Math.abs(Math.abs(other.z - placed.z) - 6) < 0.02))).length;
    assert.ok(columns.length > 0 && paired * 2 >= columns.length, `seed ${seed}: ${paired} of ${columns.length} columns stand one step from a neighbour in their line`);
  }
});

const RANKED: CaveRequest['ranks'] = [{ rank: 'rare', share: 0.25 }, { rank: 'magic', share: 0.25 }];

void test('rank shares name the deepest quarter rare and the next quarter magic, leave the rest to roll, and change nothing else', (): void => {
  for (const [at, seed] of SEEDS.entries()) {
    const result: CaveResult = generateCave({ ...request(seed), ranks: RANKED }, { kit, defs: content.props, judge: null });
    assert.ok(result.ok, result.ok ? '' : result.problem);
    const plain: CaveLayout | undefined = layouts[at];
    assert.ok(plain !== undefined);
    assert.deepEqual({ ...result.layout, packs: result.layout.packs.map((pack: CavePack): CavePack => ({ ...pack, rank: null })) }, plain);
    assert.deepEqual(result.layout.packs.map((pack: CavePack): string | null => pack.rank), [...Array.from({ length: 10 }, (): null => null), ...Array.from({ length: 5 }, (): string => 'magic'), ...Array.from({ length: 5 }, (): string => 'rare')]);
    const rolled: readonly number[] = result.layout.packs.filter((pack: CavePack): boolean => pack.rank === null).map((pack: CavePack): number => pack.level);
    const rare: readonly number[] = result.layout.packs.filter((pack: CavePack): boolean => pack.rank === 'rare').map((pack: CavePack): number => pack.level);
    assert.ok(Math.min(...rare) >= Math.max(...rolled), `seed ${seed}`);
  }
});

void test('a rank share outside 0 to 1, shares above every pack, or a share with no rank are refused', (): void => {
  for (const ranks of [[{ rank: 'rare', share: 1.5 }], [{ rank: 'rare', share: 0.6 }, { rank: 'magic', share: 0.6 }], [{ rank: '', share: 0.2 }], [{ rank: 'rare', share: -0.1 }]]) {
    const result: CaveResult = generateCave({ ...request(1), ranks }, { kit, defs: content.props, judge: null });
    assert.ok(!result.ok && result.problem.includes('rank'), JSON.stringify(ranks));
  }
});

void test('a cave can start lower than the top terrace, its chambers step down from there, and it may hold only as many chambers as fit above the floor', (): void => {
  const low: CaveResult = generateCave({ ...request(2), top: 11, chambers: 6, columns: 130, rows: 130, roomScale: 1.4 }, { kit, defs: content.props, judge: null });
  assert.ok(low.ok, low.ok ? '' : low.problem);
  assert.deepEqual(low.layout.chambers.map((chamber): number => chamber.level), [11, 9, 7, 5, 3, 1]);
  const entrance: string = low.layout.levels[Math.floor(low.layout.entrance.z / CAVE_GEN.cellSize)]?.charAt(Math.floor(low.layout.entrance.x / CAVE_GEN.cellSize)) ?? '';
  assert.equal(entrance, TERRAIN_MARKS.levels.charAt(11));
  const deep: CaveResult = generateCave({ ...request(2), top: 11, chambers: 7 }, { kit, defs: content.props, judge: null });
  assert.ok(!deep.ok && deep.problem.includes('starts at level 11 has 2 to 6 chambers'));
  const floating: CaveResult = generateCave({ ...request(2), top: 40 }, { kit, defs: content.props, judge: null });
  assert.ok(!floating.ok && floating.problem.includes('first chamber'));
});
