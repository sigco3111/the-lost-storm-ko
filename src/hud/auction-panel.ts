import type { ItemSlot, NpcDef, RarityDef } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import { countOf } from '../../sim/stacks.ts';
import { findLedger, itemAt } from '../../sim/world/purse.ts';
import type { ItemSpot } from '../../sim/world/purse.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { AuctionFlow, AuctionState } from '../auction/auction-flow.ts';
import type { AuctionTab, SalesView, ShownItems } from '../auction/auction-model.ts';
import { agoLine, AUCTION_TABS, choiceFilter, createShownItems, listedLine, parseLevel, parsePrice, proceeds, saleLine, SORTS, suggestionLine, TAB_NAMES, termsLine, timeLeft, tradeLine, UNSELLABLE_HINT } from '../auction/auction-model.ts';
import type { AuctionRules, AuctionSort, Listing, PriceBasis, PublicSale, Sale } from '../backend/auction-api.ts';
import type { HudContext, PanelView } from './context.ts';
import type { GridMetrics, HeldLine } from './auction-layout.ts';
import { fitRows, gridColumns, heldLine, rowsHeight, STASH_GRID, stashRows } from './auction-layout.ts';
import { el, label, setClass, setData, setText, setVar, tick } from './dom.ts';
import type { Dropdown, DropdownChoice } from './dropdown.ts';
import { createDropdown } from './dropdown.ts';
import { iconSvg } from './icons.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { shownTitle } from './npc-title.ts';
import { unsellable } from './trade-actions.ts';
import { promptText, use } from './prompts.ts';
import { domRows, placeRows } from './row-order.ts';
import type { ScrollFade } from './scroll-fade.ts';
import { watchScrollFade } from './scroll-fade.ts';

const AUCTION_PANEL = {
  anyLabel: '전체',
  sortLabels: { price: '최저가', newest: '최신순' },
  emptyBrowse: '조건에 맞는 물건이 없다.',
  emptyMine: '등록한 물건이 없다.',
  loading: 'Looking…',
  closedBody: '상점이 열리면 다시 오라.',
  buy: '구매',
  sure: '확인',
  cancel: '취소',
  list: '등록',
  collect: '수령',
  prev: '이전',
  next: '다음',
  stash: '보관함에서',
  pickHint: '가방이나 보관함에서 팔 아이템을 골라라.',
  stashHint: '팔 물건 고르기',
  noSeller: '누군가',
  history: '종료된 판매',
  recent: '최근 판매',
  noSales: '아직 팔린 것이 없다.',
  salesMissing: '판매 기록이 아직 열리지 않았다.',
} as const;

const STASH_HASH = {
  seed: 0x811c9dc5,
  prime: 0x01000193,
} as const;

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = { weapon: '무기', head: '머리', chest: '가슴', hands: '손', legs: '다리', feet: '발', charm: '부적' };

interface Row {
  readonly element: HTMLElement;
  readonly cell: ItemCell;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly price: HTMLElement;
  readonly act: HTMLButtonElement;
  listing: Listing;
}

interface SaleRow {
  readonly element: HTMLElement;
  readonly cell: ItemCell;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly price: HTMLElement;
  sale: Sale;
}

interface PublicRow {
  readonly element: HTMLElement;
  readonly cell: ItemCell;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly price: HTMLElement;
  sale: PublicSale;
}

interface Leaving {
  readonly element: HTMLElement;
}

const SALES_TEXT: Readonly<Record<SalesView['kind'], string>> = { loading: AUCTION_PANEL.loading, missing: AUCTION_PANEL.salesMissing, ready: AUCTION_PANEL.noSales };

function publicSub(sale: PublicSale, now: number): string {
  return `${tradeLine(sale)} · ${agoLine(sale.soldAt, now)}`;
}

function leave(row: Leaving): void {
  row.element.classList.remove('settled');
  row.element.classList.add('leaving');
  row.element.addEventListener('animationend', (event: AnimationEvent): void => {
    if (event.target === row.element && event.animationName === 'auction-row-out') row.element.remove();
  });
}

function settleRow(row: HTMLElement): void {
  row.addEventListener('animationend', (event: AnimationEvent): void => {
    if (event.target === row && event.animationName === 'auction-row-in') row.classList.add('settled');
  });
}

function picker(parent: HTMLElement, layer: HTMLElement, host: HTMLElement, name: string, choices: readonly DropdownChoice[], onChange: (value: string) => void): Dropdown {
  const holder: HTMLDivElement = el('div', 'auction-field', parent);
  label('auction-field-name', name, holder);
  return createDropdown(holder, { layer, host, name, choices, value: choices[0]?.value ?? '', onChange });
}

function numberField(parent: HTMLElement, name: string, hint: string): HTMLInputElement {
  const holder: HTMLLabelElement = el('label', 'auction-field', parent);
  label('auction-field-name', name, holder);
  const input: HTMLInputElement = el('input', 'auction-input narrow', holder);
  input.inputMode = 'numeric';
  input.placeholder = hint;
  input.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') event.stopPropagation();
  });
  return input;
}

function actButton(parent: HTMLElement, ask: string, sure: string | null): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', 'auction-act', parent);
  button.type = 'button';
  label('act-face act-ask', ask, button);
  if (sure !== null) label('act-face act-sure', sure, button);
  return button;
}

function coins(parent: HTMLElement, className: string): HTMLElement {
  const holder: HTMLDivElement = el('div', className, parent);
  el('span', 'gold-icon', holder).innerHTML = iconSvg('coin');
  return el('span', 'gold-text', holder);
}

function shown(node: HTMLElement, visible: boolean): void {
  node.classList.toggle('shown', visible);
}

export function createAuctionPanel(parent: HTMLElement, context: HudContext): PanelView {
  const flow: AuctionFlow | null = context.api.auction;
  const items: ShownItems = createShownItems();
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel auction-panel', parent);
  element.dataset['tab'] = '경매';
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  const naming: HTMLDivElement = el('div', 'trade-naming', head);
  const title: HTMLDivElement = label('panel-title', '', naming);
  const role: HTMLDivElement = label('trade-role', '', naming);
  const gold: HTMLElement = coins(head, 'trade-gold');

  const tabs: HTMLDivElement = el('div', 'auction-tabs', element);
  const mark: HTMLDivElement = el('div', 'auction-tab-mark', tabs);
  const tabButtons: Map<AuctionTab, HTMLButtonElement> = new Map<AuctionTab, HTMLButtonElement>();
  for (const tab of AUCTION_TABS) {
    const button: HTMLButtonElement = el('button', 'auction-tab', tabs);
    button.type = 'button';
    button.textContent = TAB_NAMES[tab];
    button.addEventListener('click', (): void => flow?.setTab(tab));
    tabButtons.set(tab, button);
  }
  const lineHolder: HTMLDivElement = el('div', 'auction-line', element);
  const line: HTMLDivElement = label('auction-line-text', '', lineHolder);
  const views: HTMLDivElement = el('div', 'auction-views', element);
  views.addEventListener('transitionend', (event: TransitionEvent): void => {
    if (event.target === views && event.propertyName === 'height') views.style.removeProperty('height');
  });
  const closed: HTMLDivElement = el('div', 'auction-view auction-closed', views);
  label('auction-empty', AUCTION_PANEL.closedBody, closed);

  const browseView: HTMLDivElement = el('div', 'auction-view', views);
  const filters: HTMLDivElement = el('div', 'auction-filters', browseView);
  const any: DropdownChoice = { value: '', label: AUCTION_PANEL.anyLabel };
  picker(filters, parent, element, '부위', [any, ...ITEM_SLOTS.map((each: ItemSlot): DropdownChoice => ({ value: each, label: SLOT_NAMES[each] }))], (value: string): void => {
    flow?.filter(choiceFilter('slot', value));
  });
  picker(filters, parent, element, '등급', [any, ...context.api.world.content.rarities.map((each: RarityDef): DropdownChoice => ({ value: each.id, label: each.name }))], (value: string): void => {
    flow?.filter(choiceFilter('rarity', value));
  });
  const minLevel: HTMLInputElement = numberField(filters, '레벨', 'from');
  const maxLevel: HTMLInputElement = numberField(filters, '', 'to');
  const maxPrice: HTMLInputElement = numberField(filters, '가격', '최대');
  picker(filters, parent, element, '정렬', SORTS.map((each: AuctionSort): DropdownChoice => ({ value: each, label: AUCTION_PANEL.sortLabels[each] })), (value: string): void => {
    flow?.filter(choiceFilter('sort', value));
  });
  const browseRows: HTMLDivElement = el('div', 'auction-rows', browseView);
  const browseFade: ScrollFade = watchScrollFade(browseRows);
  const browseEmpty: HTMLDivElement = label('auction-empty', '', browseView);
  const pager: HTMLDivElement = el('div', 'auction-pager', browseView);
  const prev: HTMLButtonElement = actButton(pager, AUCTION_PANEL.prev, null);
  const pageText: HTMLDivElement = label('auction-page', '', pager);
  const next: HTMLButtonElement = actButton(pager, AUCTION_PANEL.next, null);

  const sellView: HTMLDivElement = el('div', 'auction-view', views);
  const picked: HTMLDivElement = el('div', 'auction-picked', sellView);
  const pickedCell: ItemCell = createItemCell(context, picked, (): string => '');
  pickedCell.cell.classList.add('big');
  const pickedText: HTMLDivElement = el('div', 'auction-picked-text', picked);
  const pickedName: HTMLDivElement = label('auction-row-name', '', pickedText);
  const pickedSub: HTMLDivElement = label('auction-row-sub', '', pickedText);
  const pricing: HTMLDivElement = el('div', 'auction-pricing', sellView);
  const price: HTMLInputElement = numberField(pricing, '가격', 'gold');
  const listButton: HTMLButtonElement = actButton(pricing, AUCTION_PANEL.list, null);
  const source: HTMLDivElement = label('auction-source', '', sellView);
  const termsRow: HTMLDivElement = el('div', 'auction-terms-row', sellView);
  const terms: HTMLDivElement = label('auction-terms', '', termsRow);
  const listedCount: HTMLDivElement = label('auction-count', '', termsRow);
  let filledFrom: PriceBasis | null = null;
  label('panel-subtitle', AUCTION_PANEL.stash, sellView);
  const stashBox: HTMLDivElement = el('div', 'auction-stash-box', sellView);
  const stashScroll: HTMLDivElement = el('div', 'auction-stash-scroll', stashBox);
  const stashFade: ScrollFade = watchScrollFade(stashScroll);
  const stashGrid: HTMLDivElement = el('div', 'inv-grid stash-grid auction-stash', stashScroll);
  const stashCells: ItemCell[] = Array.from({ length: context.api.world.content.trade.stashSize }, (_: unknown, index: number): ItemCell => {
    const view: ItemCell = createItemCell(context, stashGrid, (item: ItemInstance): string => (unsellable(context.api.world, item, context.api.unverified(item)) ? UNSELLABLE_HINT : item.ledger === null ? '' : promptText(context.api.touch, use(AUCTION_PANEL.stashHint))));
    view.cell.addEventListener('click', (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      flow?.pick({ place: 'stash', index });
    });
    return view;
  });

  const mineView: HTMLDivElement = el('div', 'auction-view', views);
  const waiting: HTMLDivElement = el('div', 'auction-waiting', mineView);
  const waitingText: HTMLDivElement = label('auction-waiting-text', '', waiting);
  const collect: HTMLButtonElement = actButton(waiting, AUCTION_PANEL.collect, null);
  const mineTitle: HTMLDivElement = label('panel-subtitle', '', mineView);
  const mineRows: HTMLDivElement = el('div', 'auction-rows', mineView);
  const mineFade: ScrollFade = watchScrollFade(mineRows);
  const mineEmpty: HTMLDivElement = label('auction-empty', AUCTION_PANEL.emptyMine, mineView);
  const history: HTMLDivElement = el('div', 'auction-history', mineView);
  label('panel-subtitle', AUCTION_PANEL.history, history);
  const historyRows: HTMLDivElement = el('div', 'auction-rows', history);
  const historyFade: ScrollFade = watchScrollFade(historyRows);

  const salesView: HTMLDivElement = el('div', 'auction-view', views);
  label('panel-subtitle', AUCTION_PANEL.recent, salesView);
  const salesRows: HTMLDivElement = el('div', 'auction-rows auction-public', salesView);
  const salesFade: ScrollFade = watchScrollFade(salesRows);
  const salesEmpty: HTMLDivElement = label('auction-empty', AUCTION_PANEL.loading, salesView);

  const bodies: Readonly<Record<AuctionTab, HTMLElement>> = { browse: browseView, sell: sellView, mine: mineView, history: salesView };
  const viewFades: readonly ScrollFade[] = Object.values(bodies).map((body: HTMLElement): ScrollFade => watchScrollFade(body));

  minLevel.addEventListener('change', (): void => flow?.filter({ minLevel: parseLevel(minLevel.value) }));
  maxLevel.addEventListener('change', (): void => flow?.filter({ maxLevel: parseLevel(maxLevel.value) }));
  maxPrice.addEventListener('change', (): void => flow?.filter({ maxPrice: parsePrice(maxPrice.value, null) }));
  prev.addEventListener('click', (): void => flow?.turn(-1));
  next.addEventListener('click', (): void => flow?.turn(1));
  price.addEventListener('input', (): void => flow?.setPrice(price.value));
  listButton.addEventListener('click', (): void => void flow?.list());
  collect.addEventListener('click', (): void => void flow?.collect());

  const makeRow = (holder: HTMLElement, listing: Listing, verb: string, sure: string | null, onAct: (row: Row) => void): Row => {
    const row: HTMLDivElement = el('div', 'auction-row', holder);
    settleRow(row);
    const cell: ItemCell = createItemCell(context, row, (): string => '');
    const text: HTMLDivElement = el('div', 'auction-row-text', row);
    const name: HTMLDivElement = label('auction-row-name', '', text);
    const sub: HTMLDivElement = label('auction-row-sub', '', text);
    const cost: HTMLElement = coins(row, 'auction-row-price');
    const act: HTMLButtonElement = actButton(row, verb, sure);
    const view: Row = { element: row, cell, name, sub, price: cost, act, listing };
    act.addEventListener('click', (): void => onAct(view));
    return view;
  };

  const browseKept: Map<string, Row> = new Map<string, Row>();
  const mineKept: Map<string, Row> = new Map<string, Row>();
  const salesKept: Map<string, SaleRow> = new Map<string, SaleRow>();
  const publicKept: Map<string, PublicRow> = new Map<string, PublicRow>();

  const makePublic = (sale: PublicSale): PublicRow => {
    const row: HTMLDivElement = el('div', 'auction-row sale', salesRows);
    settleRow(row);
    const cell: ItemCell = createItemCell(context, row, (): string => '');
    const text: HTMLDivElement = el('div', 'auction-row-text', row);
    const name: HTMLDivElement = label('auction-row-name', '', text);
    const sub: HTMLDivElement = label('auction-row-sub', '', text);
    const cost: HTMLElement = coins(row, 'auction-row-price');
    return { element: row, cell, name, sub, price: cost, sale };
  };

  const renderPublic = (state: AuctionState, world: World): void => {
    const sales: readonly PublicSale[] = state.sales.kind === 'ready' ? state.sales.sales : [];
    const wanted: Set<string> = new Set<string>(sales.map((sale: PublicSale): string => sale.id));
    for (const [id, row] of publicKept) {
      if (wanted.has(id)) continue;
      publicKept.delete(id);
      leave(row);
    }
    const placed: HTMLElement[] = [];
    const now: number = Date.now();
    for (const sale of sales) {
      const row: PublicRow = publicKept.get(sale.id) ?? makePublic(sale);
      row.sale = sale;
      publicKept.set(sale.id, row);
      placed.push(row.element);
      const item: ItemInstance = items.shown(sale.item);
      showItem(context, row.cell, item);
      setText(row.name, itemName(world.content, item), false);
      setVar(row.name, '--rarity', rarityOf(world.content, item).color);
      row.element.classList.toggle('yours', sale.you !== null);
      setText(row.sub, publicSub(sale, now), false);
      setText(row.price, String(sale.price), true);
    }
    placeRows(domRows(salesRows, 'leaving'), placed);
    setText(salesEmpty, SALES_TEXT[state.sales.kind], false);
    shown(salesEmpty, sales.length === 0);
  };

  const makeSale = (sale: Sale): SaleRow => {
    const row: HTMLDivElement = el('div', 'auction-row sale', historyRows);
    settleRow(row);
    const cell: ItemCell = createItemCell(context, row, (): string => '');
    const text: HTMLDivElement = el('div', 'auction-row-text', row);
    const name: HTMLDivElement = label('auction-row-name', '', text);
    const sub: HTMLDivElement = label('auction-row-sub', '', text);
    const cost: HTMLElement = coins(row, 'auction-row-price');
    return { element: row, cell, name, sub, price: cost, sale };
  };

  const renderSales = (state: AuctionState, world: World): void => {
    const sales: readonly Sale[] = state.history ?? [];
    const wanted: Set<string> = new Set<string>(sales.map((sale: Sale): string => sale.id));
    for (const [id, row] of salesKept) {
      if (wanted.has(id)) continue;
      salesKept.delete(id);
      leave(row);
    }
    const placed: HTMLElement[] = [];
    for (const sale of sales) {
      const row: SaleRow = salesKept.get(sale.id) ?? makeSale(sale);
      row.sale = sale;
      salesKept.set(sale.id, row);
      placed.push(row.element);
      const item: ItemInstance = items.shown(sale.item);
      showItem(context, row.cell, item);
      setText(row.name, itemName(world.content, item), false);
      setVar(row.name, '--rarity', rarityOf(world.content, item).color);
      setText(row.sub, saleLine(sale), true);
      setText(row.price, String(sale.price), true);
    }
    placeRows(domRows(historyRows, 'leaving'), placed);
    shown(history, sales.length > 0);
  };

  const sync = (holder: HTMLElement, kept: Map<string, Row>, listings: readonly Listing[], build: (listing: Listing) => Row): void => {
    const wanted: Set<string> = new Set<string>(listings.map((listing: Listing): string => listing.id));
    for (const [id, row] of kept) {
      if (wanted.has(id)) continue;
      kept.delete(id);
      leave(row);
    }
    const placed: HTMLElement[] = [];
    for (const listing of listings) {
      const row: Row = kept.get(listing.id) ?? build(listing);
      row.listing = listing;
      kept.set(listing.id, row);
      placed.push(row.element);
    }
    placeRows(domRows(holder, 'leaving'), placed);
  };

  const fill = (row: Row, world: World, sub: string): void => {
    const item: ItemInstance = items.shown(row.listing.item);
    showItem(context, row.cell, item);
    setText(row.name, itemName(world.content, item), false);
    setVar(row.name, '--rarity', rarityOf(world.content, item).color);
    setText(row.sub, sub, false);
    setText(row.price, String(row.listing.price), true);
  };

  const sellerOf = (listing: Listing): string => (listing.yours ? '나' : (listing.seller ?? AUCTION_PANEL.noSeller));

  const renderBrowse = (state: AuctionState, world: World): void => {
    const listings: readonly Listing[] = state.page?.listings ?? [];
    sync(browseRows, browseKept, listings, (listing: Listing): Row =>
      makeRow(browseRows, listing, AUCTION_PANEL.buy, AUCTION_PANEL.sure, (row: Row): void => {
        if (flow === null || row.listing.yours) return;
        if (flow.state().confirm === row.listing.id) void flow.buy(row.listing.id);
        else flow.ask(row.listing.id);
      }),
    );
    for (const row of browseKept.values()) {
      fill(row, world, `레벨 ${row.listing.item.level} · ${sellerOf(row.listing)}`);
      row.act.classList.toggle('confirming', state.confirm === row.listing.id);
      row.act.classList.toggle('busy', state.work === 'buy' && state.confirm === null);
      row.act.disabled = row.listing.yours || state.work !== null;
      row.price.parentElement?.classList.toggle('short', row.listing.price > world.player.gold);
    }
    setText(browseEmpty, state.page === null || state.loading ? AUCTION_PANEL.loading : AUCTION_PANEL.emptyBrowse, false);
    shown(browseEmpty, listings.length === 0);
    setText(pageText, `${state.filters.page}쪽`, true);
    prev.disabled = state.filters.page <= 1;
    next.disabled = state.page?.more !== true;
    browseRows.classList.toggle('loading', state.loading);
  };

  let stashKey: number = 0;
  let stashColumns: number = 0;
  let stashShownRows: number = -1;
  let stashMetrics: GridMetrics = STASH_GRID;

  const stashSignature = (world: World, chosen: string | null): number => {
    let key: number = STASH_HASH.seed;
    const mix = (value: number): void => {
      key = Math.imul(key ^ value, STASH_HASH.prime);
    };
    for (const [index, view] of stashCells.entries()) {
      const item: ItemInstance | null = world.stash[index] ?? null;
      if (item === null) continue;
      mix(index);
      mix(item.uid);
      mix(countOf(item));
      mix(item.ledger === null ? 1 : item.ledger === chosen ? 2 : 3);
      mix(view.current === item && view.image !== null ? 1 : 0);
    }
    return key;
  };

  const placeStash = (world: World): void => {
    const rows: number = stashRows(world.stash, stashColumns);
    if (rows === stashShownRows) return;
    stashShownRows = rows;
    const visible: number = rows * stashColumns;
    for (const [index, view] of stashCells.entries()) setClass(view.cell, 'spare', index >= visible);
    setVar(stashBox, '--stash-h', `${rowsHeight(rows, stashMetrics)}px`);
    fitStash();
  };

  let stashMoving: boolean = false;

  const fitStash = (): void => {
    const rows: number = fitRows(stashBox.clientHeight, Math.max(0, stashShownRows), stashMetrics);
    setVar(stashScroll, '--stash-fit', stashMoving ? '100%' : `${rowsHeight(rows, stashMetrics)}px`);
    stashFade.update();
  };

  const stashMoved = (moving: boolean): ((event: TransitionEvent) => void) => (event: TransitionEvent): void => {
    if (event.target !== stashBox || event.propertyName !== 'height') return;
    stashMoving = moving;
    fitStash();
  };
  stashBox.addEventListener('transitionrun', stashMoved(true));
  stashBox.addEventListener('transitionend', stashMoved(false));
  stashBox.addEventListener('transitioncancel', stashMoved(false));

  const measureStash = (): void => {
    const first: HTMLElement | undefined = stashCells[0]?.cell;
    const gap: number = Number.parseFloat(getComputedStyle(stashGrid).rowGap);
    stashMetrics = { cell: first?.offsetHeight ?? STASH_GRID.cell, gap: Number.isFinite(gap) ? gap : STASH_GRID.gap };
    const columns: number = gridColumns(stashGrid.clientWidth, stashMetrics);
    if (columns !== stashColumns) {
      stashColumns = columns;
      stashShownRows = -1;
      setVar(stashGrid, '--stash-cols', String(columns));
    }
    placeStash(context.api.world);
    fitStash();
  };
  new ResizeObserver(measureStash).observe(stashGrid);
  new ResizeObserver(fitStash).observe(stashBox);

  const renderStash = (world: World, chosen: string | null): void => {
    const key: number = stashSignature(world, chosen);
    if (key === stashKey) return;
    stashKey = key;
    let changed: boolean = false;
    for (const [index, view] of stashCells.entries()) {
      if (showItem(context, view, world.stash[index] ?? null)) changed = true;
      setClass(view.cell, 'unpickable', view.current !== null && view.current.ledger === null);
      setClass(view.cell, 'picked', view.current !== null && view.current.ledger !== null && view.current.ledger === chosen);
    }
    if (stashColumns > 0) placeStash(world);
    if (changed) context.tooltip.hide();
  };

  const renderSell = (state: AuctionState, world: World, rules: AuctionRules | null): void => {
    const spot: ItemSpot | null = state.picked === null ? null : findLedger(world, state.picked);
    const item: ItemInstance | null = spot === null ? null : itemAt(world, spot);
    showItem(context, pickedCell, item);
    setText(pickedName, item === null ? AUCTION_PANEL.pickHint : itemName(world.content, item), true);
    setVar(pickedName, '--rarity', item === null ? 'var(--text-dim)' : rarityOf(world.content, item).color);
    const asked: number | null = parsePrice(state.price, rules);
    const sub: HeldLine = heldLine(item === null ? null : asked === null ? `레벨 ${item.level}` : `레벨 ${item.level} · 수령 ${proceeds(asked, rules)} 골드`, pickedSub.textContent);
    setText(pickedSub, sub.text, sub.shown);
    shown(pickedSub, sub.shown);
    const filled: boolean = state.suggested !== null && state.suggested !== filledFrom;
    filledFrom = state.suggested;
    if (price.value !== state.price && (filled || document.activeElement !== price)) {
      price.value = state.price;
      tick(price);
    }
    const suggestion: HeldLine = heldLine(state.suggested !== null && item !== null ? suggestionLine(state.suggested) : null, source.textContent);
    setText(source, suggestion.text, source.classList.contains('shown'));
    shown(source, suggestion.shown);
    const full: boolean = flow?.full() === true;
    const blocked: boolean = item === null || state.work !== null || full;
    if (listButton.disabled !== blocked) listButton.disabled = blocked;
    setClass(listButton, 'busy', state.work === 'list');
    setText(terms, rules === null ? '' : termsLine(rules), false);
    const count: HeldLine = heldLine(rules !== null && state.mine !== null ? listedLine(flow?.openCount() ?? 0, rules) : null, listedCount.textContent);
    setText(listedCount, count.text, listedCount.classList.contains('shown'));
    shown(listedCount, count.shown);
    setClass(listedCount, 'full', full);
    renderStash(world, state.picked);
  };

  const renderMine = (state: AuctionState, world: World, rules: AuctionRules | null): void => {
    const listings: readonly Listing[] = state.mine?.listings ?? [];
    sync(mineRows, mineKept, listings, (listing: Listing): Row =>
      makeRow(mineRows, listing, AUCTION_PANEL.cancel, null, (row: Row): void => {
        if (flow !== null) void flow.cancel(row.listing.id);
      }),
    );
    const now: number = Date.now();
    for (const row of mineKept.values()) {
      fill(row, world, timeLeft(row.listing.endsAt, now));
      row.act.disabled = state.work !== null;
      row.act.classList.toggle('busy', state.work === 'cancel');
    }
    shown(mineEmpty, listings.length === 0);
    setText(mineTitle, rules === null ? '내 판매 목록' : `내 등록 ${listings.length}/${rules.maxListings}`, true);
    const held = state.mine?.waiting ?? null;
    const count: number = held?.items.length ?? 0;
    const parts: string[] = [];
    if (held !== null && held.gold > 0) parts.push(`${held.gold} 골드`);
    if (count > 0) parts.push(count === 1 ? '아이템 1개' : `아이템 ${count}개`);
    setText(waitingText, parts.length === 0 ? '그대를 기다리는 것이 없다.' : `기다리는 것: ${parts.join(', ')}`, true);
    collect.disabled = parts.length === 0 || state.work !== null;
    collect.classList.toggle('busy', state.work === 'collect');
    renderSales(state, world);
  };

  let seen: number = -1;
  let shownTab: AuctionTab | null = null;
  let wasClosed: boolean = false;

  const settleHeight = (first: boolean, change: () => void): void => {
    if (first || !element.classList.contains('open')) {
      change();
      return;
    }
    const from: number = views.getBoundingClientRect().height;
    views.style.removeProperty('height');
    change();
    const to: number = views.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1) return;
    views.style.height = `${from}px`;
    views.getBoundingClientRect();
    views.style.height = `${to}px`;
  };

  const placeMark = (tab: AuctionTab): void => {
    const button: HTMLButtonElement | undefined = tabButtons.get(tab);
    if (button === undefined) return;
    mark.style.setProperty('--mark-x', `${button.offsetLeft}px`);
    mark.style.setProperty('--mark-w', `${button.offsetWidth}px`);
  };

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      const owner: string | null = world.service?.kind === 'auction' ? world.service.owner : null;
      const npc: NpcDef | null = owner === null ? null : (world.content.npcs.get(owner) ?? null);
      if (npc !== null) {
        setText(title, npc.name, false);
        setText(role, shownTitle(npc), false);
      }
      setText(gold, String(world.player.gold), true);
      if (flow === null) return;
      const state: AuctionState = flow.state();
      const rules: AuctionRules | null = flow.rules();
      if (shownTab !== state.tab || wasClosed !== state.closed) {
        const first: boolean = shownTab === null;
        shownTab = state.tab;
        wasClosed = state.closed;
        settleHeight(first, (): void => {
          for (const tab of AUCTION_TABS) {
            shown(bodies[tab], !state.closed && tab === state.tab);
            tabButtons.get(tab)?.classList.toggle('active', tab === state.tab);
          }
          shown(closed, state.closed);
          tabs.classList.toggle('closed', state.closed);
        });
        placeMark(state.tab);
      }
      if (seen !== flow.revision()) {
        seen = flow.revision();
        const status: HeldLine = heldLine(state.line?.text ?? null, line.textContent);
        if (status.shown) setData(lineHolder, 'tone', state.line?.tone ?? 'note');
        setText(line, status.text, status.shown);
        shown(lineHolder, status.shown);
        settleHeight(false, (): void => {
          renderBrowse(state, world);
          renderMine(state, world, rules);
          renderPublic(state, world);
        });
        browseFade.update();
        mineFade.update();
        historyFade.update();
        salesFade.update();
        for (const fade of viewFades) fade.update();
      }
      renderSell(state, world, rules);
      if (state.tab === 'mine') for (const row of mineKept.values()) setText(row.sub, timeLeft(row.listing.endsAt, Date.now()), false);
      if (state.tab === 'history') for (const row of publicKept.values()) setText(row.sub, publicSub(row.sale, Date.now()), false);
    },
  };
}
