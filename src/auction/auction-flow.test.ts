import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { PurseEntry } from '../../sim/world/ledger.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import type { AuctionAnswer, AuctionFilters, Listed, Listing, ListingPage, MyAuction, PriceSuggestion, PublicSale, Sale } from '../backend/auction-api.ts';
import type { AuctionHouse } from '../backend/auction.ts';
import { createAuctionFlow } from './auction-flow.ts';
import type { AuctionFlow } from './auction-flow.ts';
import { AUCTION_LINES, AUCTION_WATCH, RECORDING_LINE } from './auction-model.ts';

const content: Content = loadContent();
const LEDGER: string = 'itm_AAAAAAAAAAAAAAAAAAAAAA';
const ITEM = { id: LEDGER, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };
const LISTING: Listing = { id: 'lst_BBBBBBBBBBBBBBBBBBBBBB', item: { ...ITEM, id: 'itm_CCCCCCCCCCCCCCCCCCCCCC' }, price: 40, seller: 'Ash', listedAt: '2026-11-14T10:00:00.000Z', endsAt: '2026-11-16T10:00:00.000Z', yours: false };
const RULES = { minPrice: 1, maxPrice: 1000, maxListings: 10, cut: 0.1, lifeHours: 48, sellLevel: 3 };
const SALE: Sale = { id: 'lst_DDDDDDDDDDDDDDDDDDDDDD', item: LISTING.item, price: 40, cut: 4, proceeds: 36, outcome: 'sold', closedAt: '2026-11-14T12:00:00.000Z', collected: false };
const PUBLIC: PublicSale = { id: SALE.id, item: SALE.item, price: 40, seller: 'Ash', buyer: 'Grey Heron', soldAt: SALE.closedAt, you: null };
const BOUGHT: PurseEntry = { id: 9, kind: 'buy', gold: -40, item: LISTING.item, direction: 'in' };

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface Answers {
  browse: AuctionAnswer<ListingPage>;
  mine: AuctionAnswer<MyAuction>;
  list: AuctionAnswer<Listed>;
  buy: AuctionAnswer<readonly PurseEntry[]>;
  cancel: AuctionAnswer<readonly PurseEntry[]>;
  collect: AuctionAnswer<readonly PurseEntry[]>;
  history: AuctionAnswer<readonly Sale[]>;
  sales: AuctionAnswer<readonly PublicSale[]>;
  price: AuctionAnswer<PriceSuggestion>;
}

interface Rig {
  readonly flow: AuctionFlow;
  readonly world: World;
  readonly calls: Call[];
  readonly sent: Command[];
  readonly order: string[];
  readonly answers: Answers;
  readonly recording: Set<number>;
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function rig(): Rig {
  const world: World = worldIn(content, content.world.town, 3);
  world.player.inventory = world.player.inventory.map((): ItemInstance | null => null);
  world.player.gold = 100;
  world.player.level = 5;
  const calls: Call[] = [];
  const sent: Command[] = [];
  const recording: Set<number> = new Set<number>();
  const order: string[] = [];
  const answers: Answers = {
    browse: { kind: 'ok', value: { listings: [LISTING], page: 1, more: false } },
    mine: { kind: 'ok', value: { listings: [], waiting: { gold: 0, items: [] }, rules: RULES, entries: [] } },
    list: { kind: 'failed' },
    buy: { kind: 'failed' },
    cancel: { kind: 'failed' },
    collect: { kind: 'failed' },
    history: { kind: 'ok', value: [SALE] },
    sales: { kind: 'ok', value: [PUBLIC] },
    price: { kind: 'failed' },
  };
  const note = (name: string, args: readonly unknown[]): void => {
    calls.push({ name, args });
    order.push(name);
  };
  const house: AuctionHouse = {
    browse: (filters: AuctionFilters): Promise<AuctionAnswer<ListingPage>> => {
      note('browse', [filters]);
      return Promise.resolve(answers.browse);
    },
    mine: (purse: number): Promise<AuctionAnswer<MyAuction>> => {
      note('mine', [purse]);
      return Promise.resolve(answers.mine);
    },
    list: (ledger: string, price: number, purse: number): Promise<AuctionAnswer<Listed>> => {
      note('list', [ledger, price, purse]);
      return Promise.resolve(answers.list);
    },
    buy: (listing: string, price: number, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
      note('buy', [listing, price, purse]);
      return Promise.resolve(answers.buy);
    },
    cancel: (listing: string, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
      note('cancel', [listing, purse]);
      return Promise.resolve(answers.cancel);
    },
    collect: (purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
      note('collect', [purse]);
      return Promise.resolve(answers.collect);
    },
    history: (): Promise<AuctionAnswer<readonly Sale[]>> => {
      note('history', []);
      return Promise.resolve(answers.history);
    },
    sales: (): Promise<AuctionAnswer<readonly PublicSale[]>> => {
      note('sales', []);
      return Promise.resolve(answers.sales);
    },
    price: (ledger: string): Promise<AuctionAnswer<PriceSuggestion>> => {
      note('price', [ledger]);
      return Promise.resolve(answers.price);
    },
  };
  const sync = (): Promise<void> => {
    order.push('sync');
    return Promise.resolve();
  };
  const flow: AuctionFlow = createAuctionFlow({ house, world: (): World => world, send: (command: Command): void => void sent.push(command), sync, unverified: (item: ItemInstance): boolean => !recording.has(item.uid) });
  return { flow, world, calls, sent, order, answers, recording };
}

function named(calls: readonly Call[], name: string): Call[] {
  return calls.filter((call: Call): boolean => call.name === name);
}

async function opened(): Promise<Rig> {
  const state: Rig = rig();
  state.flow.open();
  await settle();
  return state;
}

void test('opening asks for my page with the purse cursor and the first page of listings', async (): Promise<void> => {
  const state: Rig = rig();
  state.world.purse = 5;
  state.answers.mine = { kind: 'ok', value: { listings: [], waiting: { gold: 0, items: [] }, rules: RULES, entries: [BOUGHT] } };
  state.flow.open();
  await settle();
  assert.deepEqual(named(state.calls, 'mine')[0]?.args, [5]);
  assert.equal(named(state.calls, 'browse').length, 1);
  assert.deepEqual(state.flow.state().page?.listings, [LISTING]);
  assert.deepEqual(state.sent, [{ type: 'purse', entries: [BOUGHT], stripped: [], unverified: [] }]);
});

void test('a server without the house shows the auctioneer closed', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.mine = { kind: 'closed' };
  state.answers.browse = { kind: 'closed' };
  state.flow.open();
  await settle();
  assert.equal(state.flow.state().closed, true);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.closed);
});

void test('an unverified item cannot be picked and says why', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[0] = { uid: 50, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [], ledger: null };
  state.flow.pick({ place: 'bag', index: 0 });
  assert.equal(state.flow.state().picked, null);
  assert.equal(state.flow.state().tab, 'sell');
  assert.match(state.flow.state().line?.text ?? '', /never recorded/);
});

void test('an item still being recorded says so instead of never recorded', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[0] = { uid: 51, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [], ledger: null };
  state.recording.add(51);
  state.flow.pick({ place: 'bag', index: 0 });
  assert.equal(state.flow.state().picked, null);
  assert.deepEqual(state.flow.state().line, RECORDING_LINE);
});

void test('listing sends the picked ledger id and price, and the item leaves only on the answer', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[2] = { uid: 51, ...ITEM, ledger: LEDGER };
  state.world.purse = 7;
  state.flow.pick({ place: 'bag', index: 2 });
  state.flow.setPrice('abc');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  state.flow.setPrice('120');
  const out: PurseEntry = { id: 8, kind: 'list', gold: 0, item: ITEM, direction: 'out' };
  state.answers.list = { kind: 'ok', value: { listing: { ...LISTING, yours: true }, entries: [out] } };
  const listing: Promise<void> = state.flow.list();
  assert.deepEqual(named(state.calls, 'list')[0]?.args, [LEDGER, 120, 7]);
  assert.equal(state.world.player.inventory[2].ledger, LEDGER);
  assert.deepEqual(state.sent, []);
  await listing;
  assert.deepEqual(state.sent, [{ type: 'purse', entries: [out], stripped: [], unverified: [] }]);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.listed);
  assert.equal(state.flow.state().picked, null);
});

void test('a price outside the rules is refused before any request', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[0] = { uid: 52, ...ITEM, ledger: LEDGER };
  state.flow.pick({ place: 'bag', index: 0 });
  state.flow.setPrice('5000');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  assert.match(state.flow.state().line?.text ?? '', /from 1 to 1000/);
});

void test('buying takes a second click on the same row, flushes the save first and pays the price seen', async (): Promise<void> => {
  const state: Rig = await opened();
  await state.flow.buy(LISTING.id);
  assert.equal(named(state.calls, 'buy').length, 0);
  state.flow.ask(LISTING.id);
  assert.equal(state.flow.state().confirm, LISTING.id);
  state.answers.buy = { kind: 'ok', value: [BOUGHT] };
  await state.flow.buy(LISTING.id);
  assert.deepEqual(named(state.calls, 'buy')[0]?.args, [LISTING.id, 40, 0]);
  assert.ok(state.order.indexOf('sync') < state.order.indexOf('buy'));
  assert.deepEqual(state.sent.at(-1), { type: 'purse', entries: [BOUGHT], stripped: [], unverified: [] });
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.bought);
});

void test('a buy with no room in the bags or stash is not sent', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory = state.world.player.inventory.map((_: ItemInstance | null, index: number): ItemInstance => ({ uid: 600 + index, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null }));
  state.world.stash = state.world.stash.map((_: ItemInstance | null, index: number): ItemInstance => ({ uid: 700 + index, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null }));
  state.flow.ask(LISTING.id);
  await state.flow.buy(LISTING.id);
  assert.equal(named(state.calls, 'buy').length, 0);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.noRoom);
});

void test('a refused or failed buy changes nothing and says so', async (): Promise<void> => {
  const state: Rig = await opened();
  state.flow.ask(LISTING.id);
  state.answers.buy = { kind: 'refused', code: 'listing_gone' };
  await state.flow.buy(LISTING.id);
  assert.match(state.flow.state().line?.text ?? '', /gone/);
  state.flow.ask(LISTING.id);
  state.answers.buy = { kind: 'failed' };
  await state.flow.buy(LISTING.id);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.failed);
  assert.deepEqual(state.sent, []);
  assert.equal(state.world.player.gold, 100);
});

void test('collecting with nothing waiting asks nothing of the server', async (): Promise<void> => {
  const state: Rig = await opened();
  await state.flow.collect();
  assert.equal(named(state.calls, 'collect').length, 0);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.nothing);
});

void test('collecting applies the entries and names what came back', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.mine = { kind: 'ok', value: { listings: [], waiting: { gold: 90, items: [ITEM] }, rules: RULES, entries: [] } };
  state.flow.open();
  await settle();
  const entries: readonly PurseEntry[] = [
    { id: 3, kind: 'collect', gold: 90, item: null, direction: null },
    { id: 4, kind: 'collect', gold: 0, item: ITEM, direction: 'in' },
  ];
  state.answers.collect = { kind: 'ok', value: entries };
  await state.flow.collect();
  assert.deepEqual(state.sent, [{ type: 'purse', entries, stripped: [], unverified: [] }]);
  assert.equal(state.flow.state().line?.text, 'Collected 90 gold and 1 item.');
});

void test('changing a filter starts again from the first page', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.browse = { kind: 'ok', value: { listings: [LISTING], page: 1, more: true } };
  state.flow.open();
  await settle();
  state.flow.turn(1);
  await settle();
  state.flow.turn(1);
  await settle();
  assert.equal(state.flow.state().filters.page, 3);
  state.flow.filter({ slot: 'weapon' });
  await settle();
  const last: Call | undefined = named(state.calls, 'browse').at(-1);
  assert.deepEqual(last?.args, [{ ...state.flow.state().filters, slot: 'weapon', page: 1 }]);
});

void test('my page brings the closed sales, and a server without history hides them without closing the house', async (): Promise<void> => {
  const state: Rig = await opened();
  assert.deepEqual(state.flow.state().history, [SALE]);
  state.answers.history = { kind: 'failed' };
  state.flow.setTab('mine');
  await settle();
  assert.deepEqual(state.flow.state().history, [SALE]);
  state.flow.setTab('browse');
  state.answers.history = { kind: 'closed' };
  state.flow.setTab('mine');
  await settle();
  assert.equal(state.flow.state().history, null);
  assert.equal(state.flow.state().closed, false);
});

void test('a hero under the selling level is told so before any request', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.level = 2;
  state.world.player.inventory[0] = { uid: 53, ...ITEM, ledger: LEDGER };
  state.flow.pick({ place: 'bag', index: 0 });
  state.flow.setPrice('20');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  assert.equal(state.flow.state().line?.text, 'Selling needs level 3.');
});

void test('the history tab asks for the public sales when it is chosen and when the panel opens on it', async (): Promise<void> => {
  const state: Rig = await opened();
  assert.equal(named(state.calls, 'sales').length, 0);
  assert.deepEqual(state.flow.state().sales, { kind: 'loading' });
  state.flow.setTab('history');
  await settle();
  assert.deepEqual(state.flow.state().sales, { kind: 'ready', sales: [PUBLIC] });
  state.flow.open();
  await settle();
  assert.equal(named(state.calls, 'sales').length, 2);
});

void test('a server without the public history shows it missing and keeps the house open; a later failure keeps what was shown', async (): Promise<void> => {
  const state: Rig = await opened();
  state.answers.sales = { kind: 'closed' };
  state.flow.setTab('history');
  await settle();
  assert.deepEqual(state.flow.state().sales, { kind: 'missing' });
  assert.equal(state.flow.state().closed, false);
  state.answers.sales = { kind: 'ok', value: [PUBLIC] };
  state.flow.open();
  await settle();
  state.answers.sales = { kind: 'failed' };
  state.flow.open();
  await settle();
  assert.deepEqual(state.flow.state().sales, { kind: 'ready', sales: [PUBLIC] });
});

void test('a buy refreshes the public sales too', async (): Promise<void> => {
  const state: Rig = await opened();
  state.answers.buy = { kind: 'ok', value: [BOUGHT] };
  state.flow.ask(LISTING.id);
  await state.flow.buy(LISTING.id);
  await settle();
  assert.equal(named(state.calls, 'sales').length, 1);
});

void test('while the panel is shut the house is asked about waiting gold quietly: at once, then only while listings are open', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.mine = { kind: 'ok', value: { listings: [LISTING], waiting: { gold: 0, items: [] }, rules: RULES, entries: [BOUGHT] } };
  state.flow.watch(1000, false);
  await settle();
  assert.equal(named(state.calls, 'mine').length, 1);
  assert.equal(named(state.calls, 'history').length, 0);
  assert.deepEqual(state.sent, [{ type: 'purse', entries: [BOUGHT], stripped: [], unverified: [] }]);
  state.flow.watch(1000 + AUCTION_WATCH.everyMs - 1, false);
  await settle();
  assert.equal(named(state.calls, 'mine').length, 1);
  state.answers.mine = { kind: 'ok', value: { listings: [], waiting: { gold: 225, items: [] }, rules: RULES, entries: [] } };
  state.flow.watch(1000 + AUCTION_WATCH.everyMs, false);
  await settle();
  assert.equal(state.flow.waitingGold(), 225);
  state.flow.watch(1000 + AUCTION_WATCH.everyMs * 5, false);
  await settle();
  assert.equal(named(state.calls, 'mine').length, 2);
  assert.equal(state.flow.state().line, null);
});

void test('the quiet check stays silent on a refusal and waits while the panel is open', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.mine = { kind: 'refused', code: 'no_character' };
  state.flow.watch(0, false);
  await settle();
  assert.equal(state.flow.state().line, null);
  state.flow.watch(AUCTION_WATCH.everyMs, true);
  state.flow.watch(AUCTION_WATCH.everyMs * 2 - 1, false);
  await settle();
  assert.equal(named(state.calls, 'mine').length, 1);
});

const SUGGESTED: PriceSuggestion = { price: 130, basis: { kind: 'similar', count: 4 } };

async function picking(answer: AuctionAnswer<PriceSuggestion>): Promise<Rig> {
  const state: Rig = await opened();
  state.world.player.inventory[0] = { uid: 60, ...ITEM, ledger: LEDGER };
  state.answers.price = answer;
  state.flow.pick({ place: 'bag', index: 0 });
  return state;
}

void test('picking an item asks for a price and fills the empty field with it and where it came from', async (): Promise<void> => {
  const state: Rig = await picking({ kind: 'ok', value: SUGGESTED });
  assert.deepEqual(named(state.calls, 'price')[0]?.args, [LEDGER]);
  await settle();
  assert.equal(state.flow.state().price, '130');
  assert.deepEqual(state.flow.state().suggested, SUGGESTED.basis);
  state.flow.pick({ place: 'bag', index: 0 });
  assert.equal(named(state.calls, 'price').length, 1);
});

void test('a suggestion never overwrites a price the player typed, and editing drops the source line', async (): Promise<void> => {
  const typedFirst: Rig = await picking({ kind: 'ok', value: SUGGESTED });
  typedFirst.flow.setPrice('90');
  await settle();
  assert.equal(typedFirst.flow.state().price, '90');
  assert.equal(typedFirst.flow.state().suggested, null);
  const editedAfter: Rig = await picking({ kind: 'ok', value: SUGGESTED });
  await settle();
  editedAfter.flow.setPrice('135');
  assert.equal(editedAfter.flow.state().price, '135');
  assert.equal(editedAfter.flow.state().suggested, null);
});

void test('a typed price stays when another item is picked, and a cleared field takes the next suggestion', async (): Promise<void> => {
  const state: Rig = await picking({ kind: 'failed' });
  state.flow.setPrice('90');
  state.world.player.inventory[1] = { uid: 61, ...ITEM, ledger: 'itm_EEEEEEEEEEEEEEEEEEEEEE' };
  state.answers.price = { kind: 'ok', value: SUGGESTED };
  state.flow.pick({ place: 'bag', index: 1 });
  await settle();
  assert.equal(state.flow.state().price, '90');
  state.flow.setPrice('');
  state.flow.pick({ place: 'bag', index: 0 });
  await settle();
  assert.equal(state.flow.state().price, '130');
});

void test('an older server, a refusal or a failure leaves the field empty and the house open', async (): Promise<void> => {
  const answers: readonly AuctionAnswer<PriceSuggestion>[] = [{ kind: 'closed' }, { kind: 'refused', code: 'not_listable' }, { kind: 'failed' }];
  const rigs: readonly Rig[] = await Promise.all(answers.map((answer: AuctionAnswer<PriceSuggestion>): Promise<Rig> => picking(answer)));
  await settle();
  for (const state of rigs) {
    assert.equal(state.flow.state().price, '');
    assert.equal(state.flow.state().suggested, null);
    assert.equal(state.flow.state().closed, false);
    assert.equal(state.flow.state().picked, LEDGER);
  }
});

void test('a suggestion that arrives after the panel closed is dropped', async (): Promise<void> => {
  const state: Rig = await picking({ kind: 'ok', value: SUGGESTED });
  state.flow.close();
  await settle();
  assert.equal(state.flow.state().price, '');
  assert.equal(state.flow.state().suggested, null);
  assert.equal(state.flow.state().picked, null);
});

void test('at the listing cap the count is full and listing is refused before any request', async (): Promise<void> => {
  const state: Rig = rig();
  const open: readonly Listing[] = Array.from({ length: RULES.maxListings }, (_: unknown, index: number): Listing => ({ ...LISTING, id: `lst_${String(index).padStart(22, 'Z')}`, yours: true }));
  state.answers.mine = { kind: 'ok', value: { listings: open, waiting: { gold: 0, items: [] }, rules: RULES, entries: [] } };
  state.flow.open();
  await settle();
  assert.equal(state.flow.openCount(), RULES.maxListings);
  assert.equal(state.flow.full(), true);
  state.world.player.inventory[0] = { uid: 62, ...ITEM, ledger: LEDGER };
  state.flow.pick({ place: 'bag', index: 0 });
  state.flow.setPrice('120');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  assert.equal(state.flow.state().line?.text, 'All 10 of your listings are open. Cancel one or wait for a sale.');
});
