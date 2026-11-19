import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { MonsterModDef } from '../content/combat-types.ts';
import type { PackRankDef } from '../content/rank-types.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { keptApart, rankPack } from './ranks.ts';

const content: Content = loadContent();
const DEEP: number = 20;
const ROLLS: number = 200;

function rank(id: string): PackRankDef {
  return must(content.packRanks.ranks.find((each: PackRankDef): boolean => each.id === id), id);
}

function plainMonster(): MonsterDef {
  return must([...content.monsters.values()].find((def: MonsterDef): boolean => def.boss === null && def.rank === null && def.mods.length === 0), 'a plain monster');
}

function mod(id: string): MonsterModDef {
  return must(content.monsterMods.get(id), id);
}

void test('a ranked pack never rolls a modifier kept apart from a pinned one, on its members or its leader', (): void => {
  const rng: Rng = createRng(23);
  const base: MonsterDef = plainMonster();
  for (const pinned of ['stormlit', 'swift', 'warded']) {
    const apartFromPin: string[] = content.packRanks.pool.map((entry): string => entry.mod).filter((id: string): boolean => keptApart(content.packRanks.apart, id, pinned));
    assert.ok(apartFromPin.length > 0, pinned);
    for (let roll: number = 0; roll < ROLLS; roll += 1) {
      for (const def of rankPack(content, rng, rank(roll % 2 === 0 ? 'magic' : 'rare'), [base, base, base], DEEP, [mod(pinned)])) {
        for (const held of def.mods) assert.ok(!apartFromPin.includes(held), `${held} rolled beside ${pinned}`);
      }
    }
  }
});

void test('a pinned modifier leaves the rank its full count of rolled modifiers', (): void => {
  const base: MonsterDef = plainMonster();
  const magic: PackRankDef = rank('magic');
  for (let seed: number = 1; seed <= 20; seed += 1) {
    const [pinned] = rankPack(content, createRng(seed), magic, [base], DEEP, [mod('brutal')]);
    assert.equal(must(pinned, 'pinned').mods.length, magic.members.mods);
  }
});
