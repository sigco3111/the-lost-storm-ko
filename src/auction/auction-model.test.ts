import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MyAuction, PublicSale, Sale } from '../backend/auction-api.ts';
import { agoLine, AUCTION_WATCH, choiceFilter, collectedLine, createShownItems, listedLine, parseLevel, parsePrice, peekDue, pickLine, proceeds, refusalLine, saleLine, suggestionLine, termsLine, timeLeft, tradeLine, waitingCue } from './auction-model.ts';

const RULES = { minPrice: 5, maxPrice: 1000, maxListings: 10, cut: 0.1, lifeHours: 48, sellLevel: 3 };

void test('a price is whole gold inside the rules', (): void => {
  assert.equal(parsePrice(' 120 ', RULES), 120);
  assert.equal(parsePrice('4', RULES), null);
  assert.equal(parsePrice('1001', RULES), null);
  assert.equal(parsePrice('12.5', RULES), null);
  assert.equal(parsePrice('-3', null), null);
  assert.equal(parsePrice('', null), null);
  assert.equal(parsePrice('7', null), 7);
  assert.equal(parseLevel('0'), null);
  assert.equal(parseLevel('12'), 12);
});

void test('time left reads in hours and minutes and never goes below ending', (): void => {
  const now: number = Date.parse('2026-11-14T10:00:00.000Z');
  assert.equal(timeLeft('2026-11-16T10:00:00.000Z', now), '48h left');
  assert.equal(timeLeft('2026-11-14T12:30:00.000Z', now), '2h 30m left');
  assert.equal(timeLeft('2026-11-14T10:20:00.000Z', now), '20m left');
  assert.equal(timeLeft('2026-11-14T09:00:00.000Z', now), 'Ending');
});

void test('the terms and the proceeds follow the cut the server sends', (): void => {
  assert.equal(termsLine(RULES), 'The house keeps 10% of a sale. Listings last 48 hours.');
  assert.equal(termsLine({ ...RULES, cut: 0 }), 'Listings last 48 hours.');
  assert.equal(proceeds(105, RULES), 95);
  assert.equal(proceeds(105, null), 105);
});

void test('refusals and picks read as short lines', (): void => {
  assert.equal(refusalLine('level_too_low', RULES).text, 'Selling needs level 3.');
  assert.equal(refusalLine('too_many_listings', RULES).text, 'All 10 of your listings are open. Cancel one or wait for a sale.');
  assert.equal(refusalLine('not_enough_gold', null).tone, 'refusal');
  assert.equal(pickLine('empty').tone, 'note');
  assert.deepEqual(pickLine('unverified'), { text: 'This item was never recorded, so it cannot be sold. Trader purchases and some early or offline finds are not recorded.', tone: 'refusal' });
  assert.equal(collectedLine(0, 2).text, 'Collected 2 items.');
  assert.equal(collectedLine(0, 0).tone, 'note');
});

void test('a listed roll is drawn with a stable uid that no carried item can share', (): void => {
  const items = createShownItems();
  const roll = { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };
  const first = items.shown(roll);
  assert.ok(first.uid < 0);
  assert.equal(items.shown(roll).uid, first.uid);
  assert.notEqual(items.shown({ ...roll, id: 'itm_BBBBBBBBBBBBBBBBBBBBBB' }).uid, first.uid);
  assert.equal(first.ledger, roll.id);
});

void test('a closed sale says how it ended and whether its gold or item still waits', (): void => {
  const sold: Sale = { id: 'lst_DDDDDDDDDDDDDDDDDDDDDD', item: { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] }, price: 340, cut: 34, proceeds: 306, outcome: 'sold', closedAt: '2026-11-14T12:00:00.000Z', collected: true };
  assert.equal(saleLine(sold), 'Sold for 340 · you got 306');
  assert.equal(saleLine({ ...sold, collected: false }), 'Sold for 340 · 306 waiting');
  assert.equal(saleLine({ ...sold, outcome: 'expired', collected: false }), 'Expired · waiting');
  assert.equal(saleLine({ ...sold, outcome: 'cancelled' }), 'Cancelled');
});

void test('each choice from a filter dropdown becomes the filter it names', (): void => {
  assert.deepEqual(choiceFilter('slot', 'chest'), { slot: 'chest' });
  assert.deepEqual(choiceFilter('slot', ''), { slot: null });
  assert.deepEqual(choiceFilter('slot', 'elbow'), { slot: null });
  assert.deepEqual(choiceFilter('rarity', 'rare'), { rarity: 'rare' });
  assert.deepEqual(choiceFilter('rarity', ''), { rarity: null });
  assert.deepEqual(choiceFilter('sort', 'newest'), { sort: 'newest' });
  assert.deepEqual(choiceFilter('sort', 'price'), { sort: 'price' });
  assert.deepEqual(choiceFilter('sort', 'bogus'), { sort: 'price' });
});

void test('a public sale says who sold to whom, and speaks to the reader on their own side', (): void => {
  const sale: PublicSale = { id: 'lst_BBBBBBBBBBBBBBBBBBBBBB', item: { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] }, price: 250, seller: 'Grey Heron', buyer: 'Ash', soldAt: '2026-11-15T10:00:00.000Z', you: null };
  assert.equal(tradeLine(sale), 'Grey Heron sold to Ash');
  assert.equal(tradeLine({ ...sale, you: 'seller' }), 'You sold to Ash');
  assert.equal(tradeLine({ ...sale, you: 'buyer' }), 'You bought from Grey Heron');
  assert.equal(tradeLine({ ...sale, seller: null, buyer: null }), 'Someone sold to Someone');
});

void test('a sale time reads as how long ago, in minutes, hours or days', (): void => {
  const now: number = Date.parse('2026-11-15T10:00:00.000Z');
  assert.equal(agoLine('2026-11-15T09:59:40.000Z', now), 'just now');
  assert.equal(agoLine('2026-11-15T09:15:00.000Z', now), '45m ago');
  assert.equal(agoLine('2026-11-15T07:00:00.000Z', now), '3h ago');
  assert.equal(agoLine('2026-11-12T10:00:00.000Z', now), '3d ago');
  assert.equal(agoLine('2026-11-15T10:05:00.000Z', now), 'just now');
});

function mine(open: number): MyAuction {
  return { listings: Array.from({ length: open }, (_: unknown, index: number) => ({ id: `lst_${String(index).padStart(22, 'B')}`, item: { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] }, price: 5, seller: null, listedAt: '2026-11-15T10:00:00.000Z', endsAt: '2026-11-17T10:00:00.000Z', yours: true })), waiting: { gold: 0, items: [] }, rules: RULES, entries: [] };
}

void test('the house is asked about waiting gold once, then again only while listings are open', (): void => {
  assert.equal(peekDue(null, 0, null), true);
  assert.equal(peekDue(0, AUCTION_WATCH.everyMs - 1, mine(1)), false);
  assert.equal(peekDue(0, AUCTION_WATCH.everyMs, mine(1)), true);
  assert.equal(peekDue(0, AUCTION_WATCH.everyMs * 10, mine(0)), false);
  assert.equal(peekDue(0, AUCTION_WATCH.everyMs, null), true);
  assert.equal(waitingCue(225), '225 at the auctioneer');
  assert.equal(waitingCue(0), '');
});

void test('the suggestion says where it came from and the count says how many of the allowed listings are open', (): void => {
  assert.equal(suggestionLine({ kind: 'similar', count: 4 }), 'Suggested from 4 similar items');
  assert.equal(suggestionLine({ kind: 'similar', count: 1 }), 'Suggested from 1 similar item');
  assert.equal(suggestionLine({ kind: 'default' }), 'Suggested price: no similar items yet');
  assert.equal(listedLine(9, RULES), '9 of 10 listed');
  assert.equal(listedLine(12, RULES), '10 of 10 listed');
});
