import type { TradeClose, TradeFrame, TradeGoods, TradeItem, TradeRefusal, TradeSide } from './trade-protocol.ts';
import { TRADE_LIMITS } from './trade-protocol.ts';

export const TRADE_MODEL = {
  changeLockMs: 1200,
  msPerSecond: 1000,
  noteMs: 4500,
} as const;

export type NoteTone = 'note' | 'done' | 'refusal';

export interface TradeNote {
  readonly text: string;
  readonly tone: NoteTone;
}

export interface Incoming {
  readonly from: string;
  readonly name: string;
  readonly expiresAt: number;
}

export interface OpenTrade {
  readonly with: string;
  readonly name: string;
  readonly revision: number;
  readonly mine: TradeSide;
  readonly theirs: TradeSide;
  readonly countdownEndsAt: number | null;
  readonly changedAt: number | null;
}

export interface TradeState {
  readonly incoming: Incoming | null;
  readonly asking: string | null;
  readonly open: OpenTrade | null;
  readonly note: TradeNote | null;
}

export const NO_TRADE: TradeState = { incoming: null, asking: null, open: null, note: null };

export type TradeCard = { readonly kind: 'none' } | { readonly kind: 'incoming'; readonly incoming: Incoming } | { readonly kind: 'asking'; readonly name: string } | { readonly kind: 'note'; readonly note: TradeNote };

export function tradeCard(state: TradeState, noteAge: number): TradeCard {
  if (state.incoming !== null) return { kind: 'incoming', incoming: state.incoming };
  if (state.open !== null) return { kind: 'none' };
  if (state.asking !== null) return { kind: 'asking', name: state.asking };
  if (state.note !== null && noteAge < TRADE_MODEL.noteMs) return { kind: 'note', note: state.note };
  return { kind: 'none' };
}

export function tradeBusy(state: TradeState): boolean {
  return state.open !== null || state.asking !== null;
}

export function askingText(name: string): string {
  return `${name}의 응답을 기다리는 중.`;
}

const EMPTY_SIDE: TradeSide = { items: [], gold: 0, confirmed: false };

const REFUSAL_TEXT: Readonly<Record<TradeRefusal, string>> = {
  unsupported: '아직 거래할 수 없다. 상대의 게임을 새로고침해야 한다.',
  not_here: '거래는 은신처에서 한다.',
  no_such_player: '그 플레이어는 떠났다.',
  self: '자기 자신과는 거래할 수 없다.',
  not_accepting: '그대와의 거래를 받지 않는다.',
  busy: '둘 중 한 명이 이미 거래 중이다.',
  too_far: '가까이 걸어가서 거래하라.',
  slow_down: '너무 빠르다. 잠시 기다려라.',
  changed: '제안이 바뀌었다. 확인 전에 다시 살펴라.',
  no_trade: '그 거래는 끝났다.',
  no_room: '가방이 가득 찼다. 확인 전에 자리를 만들어라.',
  no_character: '거래하려면 캐릭터가 필요하다.',
  too_many: `한 번의 거래에 아이템은 최대 ${String(TRADE_LIMITS.items)}개.`,
  repeated: '그 아이템은 이미 올려져 있다.',
  not_yours: '그 아이템은 더는 거래할 수 없다.',
  story: '이야기가 주는 아이템은 거래할 수 없다.',
  not_enough_gold: '그만큼의 골드가 없다.',
};

const CLOSE_TEXT: Readonly<Record<TradeClose, string>> = {
  cancelled: '거래가 취소됐다.',
  declined: '거래를 거절했다.',
  expired: '거래 요청이 만료됐다.',
  walked_away: '너무 멀어졌다. 거래가 취소됐다.',
  left: '상대가 떠났다. 거래가 취소됐다.',
  disconnected: '연결이 끊겼다. 거래가 취소됐다.',
  failed: '거래를 마치지 못했다. 아무것도 오가지 않았다.',
};

export function refusalText(reason: TradeRefusal): string {
  return REFUSAL_TEXT[reason];
}

export function closeText(reason: TradeClose): string {
  return CLOSE_TEXT[reason];
}

function sameGoods(a: TradeGoods, b: TradeGoods): boolean {
  return a.gold === b.gold && a.items.length === b.items.length && a.items.every((item: TradeItem, index: number): boolean => item.id === b.items[index]?.id);
}

function goodsLine(goods: TradeGoods): string {
  const parts: string[] = [];
  if (goods.items.length > 0) parts.push(goods.items.length === 1 ? '아이템 1개' : `아이템 ${String(goods.items.length)}개`);
  if (goods.gold > 0) parts.push(`${String(goods.gold)} 골드`);
  return parts.length === 0 ? 'nothing' : parts.join(' 그리고 ');
}

export function doneText(gave: TradeGoods, got: TradeGoods): string {
  return `거래 완료. 준 것: ${goodsLine(gave)}, 받은 것: ${goodsLine(got)}`;
}

function withSides(state: TradeState, frame: Extract<TradeFrame, { type: 'trade_state' }>, now: number): TradeState {
  if (state.open === null) return state;
  const changed: boolean = !sameGoods(state.open.theirs, frame.theirs);
  return {
    ...state,
    open: { ...state.open, revision: frame.revision, mine: frame.mine, theirs: frame.theirs, countdownEndsAt: frame.countdownEndsAt, changedAt: changed ? now : state.open.changedAt },
    note: changed ? { text: `${state.open.name} 측이 제안을 바꿨다. 확인 전에 다시 살펴라.`, tone: 'note' } : state.note,
  };
}

export function tradeStep(state: TradeState, frame: TradeFrame, now: number): TradeState {
  switch (frame.type) {
    case 'trade_asked':
      return { ...state, incoming: { from: frame.from, name: frame.name, expiresAt: frame.expiresAt } };
    case 'trade_open':
      return { incoming: null, asking: null, note: null, open: { with: frame.with, name: frame.name, revision: 0, mine: EMPTY_SIDE, theirs: EMPTY_SIDE, countdownEndsAt: null, changedAt: null } };
    case 'trade_state':
      return withSides(state, frame, now);
    case 'trade_refused':
      return { ...state, asking: state.open === null ? null : state.asking, note: { text: refusalText(frame.reason), tone: 'refusal' } };
    case 'trade_closed':
      return { incoming: null, asking: null, open: null, note: { text: closeText(frame.reason), tone: 'refusal' } };
    case 'trade_done':
      return { incoming: null, asking: null, open: null, note: { text: doneText(frame.gave, frame.got), tone: 'done' } };
  }
  return state;
}

export function asked(state: TradeState, name: string): TradeState {
  return { ...state, asking: name, note: { text: `${name}에게 거래를 요청했다.`, tone: 'note' } };
}

export function expire(state: TradeState, now: number): TradeState {
  if (state.incoming === null || state.incoming.expiresAt > now) return state;
  return { ...state, incoming: null };
}

export function gone(state: TradeState): TradeState {
  if (state.open === null && state.incoming === null && state.asking === null) return state;
  return { incoming: null, asking: null, open: null, note: state.open === null ? null : { text: closeText('disconnected'), tone: 'refusal' } };
}

export function parseGold(text: string): number | null {
  const trimmed: string = text.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const gold: number = Number(trimmed);
  return gold <= TRADE_LIMITS.gold ? gold : null;
}

export type ConfirmBlock = 'none' | 'confirmed' | 'changed' | 'no_room' | 'empty';

export function confirmBlock(open: OpenTrade, freeSlots: number, now: number): ConfirmBlock {
  if (open.mine.confirmed) return 'confirmed';
  if (open.changedAt !== null && now - open.changedAt < TRADE_MODEL.changeLockMs) return 'changed';
  if (open.mine.items.length === 0 && open.mine.gold === 0 && open.theirs.items.length === 0 && open.theirs.gold === 0) return 'empty';
  if (freeSlots + open.mine.items.length < open.theirs.items.length) return 'no_room';
  return 'none';
}

function roomText(short: number): string {
  return `Your bags are full: make room for ${short === 1 ? '아이템 1개 더' : `${String(short)} more items`}.`;
}

export function blockText(block: ConfirmBlock, open: OpenTrade, freeSlots: number): string | null {
  switch (block) {
    case 'none':
      return null;
    case 'confirmed':
      return open.theirs.confirmed ? '둘 다 확인했다.' : `${open.name}의 확인을 기다리는 중.`;
    case 'changed':
      return '제안이 방금 바뀌었다.';
    case 'empty':
      return '거래할 아이템이나 골드를 올려라.';
    case 'no_room':
      return roomText(open.theirs.items.length - open.mine.items.length - freeSlots);
  }  return null;
}

export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / TRADE_MODEL.msPerSecond));
}
