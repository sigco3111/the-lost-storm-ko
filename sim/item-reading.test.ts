import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { readItem, readingLines } from './item-reading.ts';
import type { ItemReading, ReadingLine, ReadingRow } from './item-reading.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();

function item(base: string, rarity: string, affixes: ItemInstance['affixes'], level: number = 1): ItemInstance {
  return { uid: 1, base, rarity, level, affixes, ledger: null };
}

function texts(rows: readonly ReadingRow[]): string[] {
  return rows.map((entry: ReadingRow): string => `${entry.text}${entry.deltaText === null ? '' : ` (${entry.deltaText})`}`);
}

void test('a weapon leads with its damage range and the change in average hit, then every line in the fixed order', (): void => {
  const sword: ItemInstance = item('stormsteel_sword', 'rare', [{ affix: 'brimming', value: 8 }, { affix: 'keen', value: 0.03 }, { affix: 'honed', value: 0.07 }]);
  const blade: ItemInstance = item('rusted_blade', 'magic', [{ affix: 'keen', value: 0.02 }]);
  const reading: ItemReading = readItem(content, sword, blade);
  assert.deepEqual(reading.headline, { kind: 'damage', min: 5, max: 9, delta: 2.5 });
  assert.deepEqual(texts(reading.rows), ['+7% Damage (+7%)', '+10% Attack Speed (+10%)', '+6% Critical Strike Chance (+4%)', '+8 Maximum Mana (+8)']);
  assert.deepEqual(texts(reading.lost), ['Movement Speed (−3%)']);
});

void test('armour leads an armour piece, a charm leads with its first line, and with nothing equipped no change is shown', (): void => {
  const shirt: ItemInstance = item('saltworn_shirt', 'magic', [{ affix: 'grounded', value: 0.08 }]);
  const reading: ItemReading = readItem(content, shirt, null);
  assert.equal(reading.headline.kind === 'stat' ? reading.headline.row.stat : null, 'armour');
  assert.ok(reading.rows.every((entry: ReadingRow): boolean => entry.delta === null && entry.stat !== 'armour'));
  const charm: ReadingRow | null = (() => {
    const read: ItemReading = readItem(content, item('ember_charm', 'common', []), null);
    return read.headline.kind === 'stat' ? read.headline.row : null;
  })();
  assert.equal(charm?.stat, 'critChance');
});

void test('a line that cancels the base out to nothing is left off instead of reading as +0%', (): void => {
  const slow: number = must(must(content.itemBases.get('ringmail_hauberk'), 'hauberk').implicit.find((mod) => mod.stat === 'moveSpeed'), 'mail slow').value;
  const hauberk: ItemInstance = item('ringmail_hauberk', 'rare', [{ affix: 'fleet', value: -slow }, { affix: 'hale', value: 20 }]);
  const reading: ItemReading = readItem(content, hauberk, null);
  assert.ok(!reading.rows.some((entry: ReadingRow): boolean => entry.stat === 'moveSpeed'));
  assert.ok(reading.rows.some((entry: ReadingRow): boolean => entry.stat === 'maxLife'));
});

void test('a lost line sits in its own place in the fixed order, not at the end', (): void => {
  const sword: ItemInstance = item('stormsteel_sword', 'rare', [{ affix: 'brimming', value: 8 }, { affix: 'quick', value: 0.1 }]);
  const blade: ItemInstance = item('rusted_blade', 'magic', []);
  const lines: readonly ReadingLine[] = readingLines(readItem(content, sword, blade));
  assert.deepEqual(
    lines.map((line: ReadingLine): string => `${line.lost ? 'lost ' : ''}${line.row.stat}`),
    ['attackSpeed', 'critChance', 'lost moveSpeed', 'maxMana'],
  );
});
