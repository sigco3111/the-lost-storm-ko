import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { emptyTally, playerStats } from '../../sim/tally.ts';
import { createWorld } from '../../sim/world/create.ts';
import { toSave } from '../../sim/save.ts';
import type { CharacterProfile } from '../backend/api.ts';
import { must } from '../../test/support.ts';
import { countText, foundLines, foundTotal, ownFigures, playedText, profileFigures, recordLines, valueText } from './record-lines.ts';
import type { RecordLine } from './record-lines.ts';

const content: Content = loadContent();

void test('time played reads in hours and minutes, and under a minute says so', (): void => {
  assert.equal(playedText(0), 'Under a minute');
  assert.equal(playedText(59.9), 'Under a minute');
  assert.equal(playedText(60), '1m');
  assert.equal(playedText(49 * 60 + 30), '49m');
  assert.equal(playedText(2 * 3600 + 5 * 60), '2h 05m');
  assert.equal(playedText(120 * 3600), '120h 00m');
  assert.equal(playedText(Number.NaN), 'Under a minute');
});

void test('counts are whole, never negative, and grouped by thousands', (): void => {
  assert.equal(countText(1234567.9), '1,234,567');
  assert.equal(countText(-5), '0');
});

void test('items found add up across rarities and list them in rarity order with their names', (): void => {
  const [first, second] = content.rarities;
  const low = must(first, 'first rarity');
  const high = must(second, 'second rarity');
  const found: Record<string, number> = { [high.id]: 2, [low.id]: 5 };
  assert.equal(foundTotal(found), 7);
  assert.deepEqual(foundLines(content, found), [{ rarity: low.id, name: low.name, count: 5 }, { rarity: high.id, name: high.name, count: 2 }]);
});

void test('your own record comes from the save: every line in order, the zone by its name', (): void => {
  const world = createWorld(content, { seed: 2, save: null });
  world.player.kills = 1500;
  world.player.tally = { ...emptyTally(), played: 3725, deaths: 4, bosses: 1, biggestHit: 98 };
  const lines: readonly RecordLine[] = recordLines(ownFigures(content, playerStats(content, toSave(world))));
  assert.deepEqual(lines.map((line: RecordLine): string => line.id), ['played', 'kills', 'bosses', 'deaths', 'level', 'furthest', 'hit', 'gold', 'found', 'quests', 'moments']);
  const text = (id: string): string => valueText(must(lines.find((line: RecordLine): boolean => line.id === id), id).value);
  assert.equal(text('played'), '1h 02m');
  assert.equal(text('kills'), '1,500');
  assert.equal(text('deaths'), '4');
  assert.equal(text('furthest'), must(content.zones.get(world.zone.id), 'zone').name);
});

void test('a profile record takes the server time in milliseconds and the higher of its best and current level', (): void => {
  const profile: CharacterProfile = {
    name: 'Rook',
    hero: null,
    level: 5,
    furthest: 'Stillhold',
    online: false,
    stats: { playedMs: 90 * 60_000, kills: 3, bosses: 0, deaths: 1, bestLevel: 6, biggestHit: 20, goldLooted: 40, moments: 0, quests: 2, found: {} },
    worn: [],
    build: null,
  };
  const figures = profileFigures(profile);
  assert.equal(figures.playedSeconds, 5400);
  assert.equal(figures.level, 6);
  assert.equal(figures.furthest, 'Stillhold');
});
