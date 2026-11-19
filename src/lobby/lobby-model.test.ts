import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoardRow, Leaderboard, PresentList } from '../backend/api.ts';
import { RANKINGS } from '../backend/api.ts';
import { DAMAGE_EXPLAINED } from '../../sim/ladder.ts';
import { playedShort, agoText, arrivalsText, asksForName, charactersText, levelUpText, moreText, nameProblem, onlineTotal, passedNames, presentView, RANKING_TABS, rankValueText, shownKey, spokenName, tabOf, tidyName, wholeText } from './lobby-model.ts';

function row(rank: number, name: string, level: number): BoardRow {
  return { rank, name, level, damage: 0, life: 0, playedMs: 0, kills: 0, deaths: 0, furthest: 'The Waystation', online: false, account: null };
}

function board(top: readonly BoardRow[], you: string | null, chosen: boolean = true): Leaderboard {
  const mine: BoardRow | undefined = top.find((entry: BoardRow): boolean => entry.name === you);
  return { by: 'level', top, you: mine === undefined ? null : { ...mine, chosen }, online: 1, present: null, characters: top.length, levelUps: [] };
}

void test('passing someone names everyone who was ahead and now is behind', (): void => {
  const before: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Moth', 5), row(3, 'Wren', 5), row(4, 'Me', 4)], 'Me');
  const after: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Me', 5), row(3, 'Moth', 5), row(4, 'Wren', 5)], 'Me');
  assert.deepEqual(passedNames(before, after), ['Moth', 'Wren']);
});

void test('a player who drops off the bottom of the board while the caller climbs onto it was passed', (): void => {
  const before: Leaderboard = { ...board([row(1, 'Ash', 6), row(2, 'Moth', 3)], null), you: { ...row(3, 'Me', 3), chosen: true } };
  const after: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Me', 4)], 'Me');
  assert.deepEqual(passedNames(before, after), ['Moth']);
});

void test('no one is passed on the first read, when the rank holds or drops, or when the character changed', (): void => {
  const before: Leaderboard = board([row(1, 'Ash', 6), row(2, 'Me', 4)], 'Me');
  assert.deepEqual(passedNames(null, before), []);
  assert.deepEqual(passedNames(before, before), []);
  assert.deepEqual(passedNames(before, board([row(1, 'Ash', 6), row(2, 'Moth', 5), row(3, 'Me', 4)], 'Me')), []);
  assert.deepEqual(passedNames(before, board([row(1, 'Other', 7)], 'Other')), []);
  assert.deepEqual(passedNames(board([row(1, 'Ash', 6)], null), before), []);
});

void test('the name check mirrors the server rules it can know without asking', (): void => {
  assert.equal(nameProblem('Al'), 'name_length');
  assert.equal(nameProblem('  Al  '), 'name_length');
  assert.equal(nameProblem('Seventeen Letters'), 'name_length');
  assert.equal(nameProblem('Wren_1'), 'name_characters');
  assert.equal(nameProblem('123'), 'name_characters');
  assert.equal(nameProblem('Grey   Heron'), null);
  assert.equal(tidyName('  Grey   Heron '), 'Grey Heron');
});

void test('a fresh or unnamed character is asked for a name, a named one is not', (): void => {
  assert.equal(asksForName(board([], null)), true);
  assert.equal(asksForName(board([row(1, 'Ashen Wolf', 2)], 'Ashen Wolf', false)), true);
  assert.equal(asksForName(board([row(1, 'Wren', 2)], 'Wren', true)), false);
});

void test('times and counts read as short words', (): void => {
  assert.equal(agoText(0), 'just now');
  assert.equal(agoText(7), '7m ago');
  assert.equal(agoText(125), '2h ago');
  assert.equal(agoText(60 * 50), '2d ago');
  assert.equal(charactersText(1), '1 character');
  assert.equal(charactersText(12), '12 characters');
  assert.equal(levelUpText({ name: 'Wren', level: 4, minutesAgo: 1 }), 'Wren reached level 4');
});

void test('only a name the player chose is ever spoken', (): void => {
  assert.equal(spokenName(board([row(1, 'Guest 4821', 1)], 'Guest 4821', false)), null);
  assert.equal(spokenName(board([row(1, 'Tavin', 1)], 'Tavin', true)), 'Tavin');
  assert.equal(spokenName(board([row(1, 'Ash', 3)], null)), null);
  assert.equal(spokenName(null), null);
});

void test('there is one tab per ranking, in order, and the damage tab says what it measures in one line', (): void => {
  assert.deepEqual(RANKING_TABS.map((tab) => tab.by), [...RANKINGS]);
  assert.deepEqual(RANKING_TABS.map((tab) => tab.label), ['Level', 'Damage', 'Life', 'Time', 'Kills', 'Deaths']);
  assert.equal(tabOf('damage').caption, DAMAGE_EXPLAINED);
  for (const tab of RANKING_TABS) assert.ok(tab.caption.length > 0 && !tab.caption.includes('\n'));
});

void test('every ranked value is a whole number with thousands grouped', (): void => {
  const entry: BoardRow = { ...row(1, 'Ash', 12), damage: 12345.8, life: 987, playedMs: 7_380_000, kills: 12_034, deaths: 4 };
  assert.deepEqual(RANKINGS.map((by) => rankValueText(entry, by)), ['12', '12,345', '987', '2h 03m', '12,034', '4']);
  assert.equal(wholeText(1_000_000_000), '1,000,000,000');
  assert.equal(wholeText(-4), '0');
  assert.equal(wholeText(Number.NaN), '0');
});

void test('time played reads in minutes, then hours and minutes, then whole hours once it is long', (): void => {
  assert.deepEqual([0, 59_999, 60_000, 3_540_000, 3_600_000, 35_940_000, 36_000_000, 4_320_000_000, -5, Number.NaN].map(playedShort), ['0m', '0m', '1m', '59m', '1h 00m', '9h 59m', '10h', '1,200h', '0m', '0m']);
});

void test('the same answer has the same shown key', (): void => {
  const rows: readonly BoardRow[] = [row(1, 'Ash', 6), row(2, 'Me', 5)];
  assert.equal(shownKey(board(rows, 'Me'), 10), shownKey(board([...rows], 'Me'), 10));
});

void test('facts the ladder does not draw do not change the shown key', (): void => {
  const rows: readonly BoardRow[] = [row(1, 'Ash', 6), row(2, 'Me', 5)];
  const base: Leaderboard = board(rows, 'Me');
  const key: string = shownKey(base, 10);
  assert.equal(shownKey({ ...base, characters: 99 }, 10), key);
  assert.equal(shownKey({ ...base, top: rows.map((entry: BoardRow): BoardRow => ({ ...entry, damage: 777, life: 55 })) }, 10), key);
  assert.equal(shownKey(board([...rows, row(3, 'Deep', 1)], 'Me'), 2), key);
});

void test('anything the ladder draws changes the shown key', (): void => {
  const rows: readonly BoardRow[] = [row(1, 'Ash', 6), row(2, 'Me', 5)];
  const base: Leaderboard = board(rows, 'Me');
  const key: string = shownKey(base, 10);
  assert.notEqual(shownKey(board([row(1, 'Ash', 7), row(2, 'Me', 5)], 'Me'), 10), key);
  assert.notEqual(shownKey(board([row(1, 'Me', 6), row(2, 'Ash', 5)], 'Me'), 10), key);
  assert.notEqual(shownKey({ ...base, online: 2 }, 10), key);
  assert.notEqual(shownKey({ ...base, by: 'damage' }, 10), key);
  assert.notEqual(shownKey({ ...base, levelUps: [{ name: 'Ash', level: 6, minutesAgo: 3 }] }, 10), key);
  assert.notEqual(shownKey(board(rows, 'Ash'), 10), key);
  assert.notEqual(shownKey(board(rows, null), 10), key);
});

void test('the value shown follows the ranking, so a change to another figure is not a change', (): void => {
  const rows: readonly BoardRow[] = [{ ...row(1, 'Ash', 6), damage: 100 }];
  const byDamage: Leaderboard = { ...board(rows, null), by: 'damage' };
  const moved: Leaderboard = { ...byDamage, top: [{ ...row(1, 'Ash', 9), damage: 100 }] };
  assert.equal(shownKey(moved, 10), shownKey(byDamage, 10));
  assert.notEqual(shownKey({ ...byDamage, top: [{ ...row(1, 'Ash', 6), damage: 101 }] }, 10), shownKey(byDamage, 10));
});

void test('a minute passing on a level-up note changes the shown key', (): void => {
  const base: Leaderboard = { ...board([row(1, 'Ash', 6)], null), levelUps: [{ name: 'Ash', level: 6, minutesAgo: 3 }] };
  const later: Leaderboard = { ...base, levelUps: [{ name: 'Ash', level: 6, minutesAgo: 4 }] };
  assert.notEqual(shownKey(later, 10), shownKey(base, 10));
});

const PRESENT: PresentList = {
  characters: [
    { name: 'Rook', level: 5, furthest: 'Stillhold' },
    { name: 'Me', level: 4, furthest: 'Duskway' },
    { name: 'Wren', level: 3, furthest: 'Duskway' },
  ],
  more: 2,
  visitors: 1,
};

void test('the online list puts the caller first, then the others in the order the server gave', (): void => {
  const mine: Leaderboard = { ...board([row(1, 'Rook', 5), row(2, 'Me', 4)], 'Me'), you: { ...row(2, 'Me', 4), online: true, chosen: true }, present: PRESENT };
  assert.deepEqual(presentView(mine), {
    rows: [
      { name: 'Me', level: 4, furthest: 'The Waystation', own: true },
      { name: 'Rook', level: 5, furthest: 'Stillhold', own: false },
      { name: 'Wren', level: 3, furthest: 'Duskway', own: false },
    ],
    more: 2,
    visitors: 1,
  });
  assert.equal(onlineTotal(mine), 6);
  const visitor: Leaderboard = { ...board([row(1, 'Rook', 5)], null), present: PRESENT };
  assert.deepEqual(presentView(visitor)?.rows.map((entry) => entry.name), ['Rook', 'Me', 'Wren']);
  assert.equal(presentView(visitor)?.rows.some((entry) => entry.own), false);
});

void test('a caller beyond the listed names comes first and leaves the rest count, an offline caller is left out, and an unnamed caller is only a visitor', (): void => {
  const beyond: Leaderboard = { ...board([row(1, 'Moth', 7)], 'Moth'), you: { ...row(1, 'Moth', 7), online: true, chosen: true }, present: PRESENT };
  const view = presentView(beyond);
  assert.ok(view !== null);
  assert.deepEqual(view.rows.map((entry) => [entry.name, entry.own]), [['Moth', true], ['Rook', false], ['Me', false], ['Wren', false]]);
  assert.equal(view.more, 1);
  assert.equal(onlineTotal(beyond), 6);
  const away: Leaderboard = { ...beyond, you: { ...row(1, 'Moth', 7), online: false, chosen: true } };
  assert.deepEqual(presentView(away)?.rows.map((entry) => entry.name), ['Rook', 'Me', 'Wren']);
  assert.equal(presentView(away)?.more, 2);
  const unnamed: Leaderboard = { ...board([row(1, 'Ashen Wolf', 2)], 'Ashen Wolf', false), present: PRESENT };
  assert.deepEqual(presentView(unnamed)?.rows.map((entry) => entry.name), ['Rook', 'Me', 'Wren']);
});

void test('an older server has no list and the label keeps its plain count', (): void => {
  const older: Leaderboard = { ...board([row(1, 'Rook', 5)], 'Rook'), online: 4 };
  assert.equal(presentView(older), null);
  assert.equal(onlineTotal(older), 4);
});

void test('the list lines read as short words, and a change in the list redraws the ladder', (): void => {
  assert.equal(moreText(1), '1 more');
  assert.equal(moreText(3), '3 more');
  assert.equal(arrivalsText(1), '1 new arrival, not named yet');
  assert.equal(arrivalsText(4), '4 new arrivals, not named yet');
  const base: Leaderboard = { ...board([row(1, 'Rook', 5)], null), present: PRESENT };
  assert.equal(shownKey(base, 10), shownKey({ ...base }, 10));
  assert.notEqual(shownKey({ ...base, present: { ...PRESENT, visitors: 2 } }, 10), shownKey(base, 10));
  assert.notEqual(shownKey({ ...base, present: { ...PRESENT, characters: PRESENT.characters.slice(1) } }, 10), shownKey(base, 10));
});
