import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { PackMember, ZonePack } from '../content/zone-types.ts';
import type { MonsterState, World } from './types.ts';

const SEEDS: readonly number[] = [1, 2, 3, 5, 7, 11, 13, 17];

void test('pieces that stand fixed, the Inner Hall clocks and ledger, stand exactly on their marks on every seed', (): void => {
  const content: Content = loadContent();
  for (const seed of SEEDS) {
    const world: World = worldIn(content, 'ledger_court', seed);
    const marks: string[] = world.zone.packs.flatMap((pack: ZonePack): string[] => pack.members.filter((member: PackMember): boolean => content.monsters.get(member.monster)?.behaviour.type === 'fixed').map((): string => `${pack.x},${pack.z}`));
    const fixed: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.def.behaviour.type === 'fixed');
    assert.equal(fixed.length, marks.length, `seed ${seed}`);
    assert.deepEqual(fixed.map((monster: MonsterState): string => `${monster.pos.x},${monster.pos.z}`).toSorted(), marks.toSorted(), `seed ${seed}`);
  }
});
