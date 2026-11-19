import { ITEM_SLOTS } from '../../sim/content/types.ts';
import type { LedgerItem } from '../../sim/world/ledger.ts';
import type { ListRefusal } from '../../sim/world/purse.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { AuctionFilters, AuctionRefusal, AuctionRules, AuctionSort, MyAuction, PriceBasis, PublicSale, Sale } from '../backend/auction-api.ts';

export type AuctionTab = 'browse' | 'sell' | 'mine' | 'history';

export const AUCTION_TABS: readonly AuctionTab[] = ['browse', 'sell', 'mine', 'history'];

export const TAB_NAMES: Readonly<Record<AuctionTab, string>> = { browse: '둘러보기', sell: '판매', mine: '내 것', history: '기록' };

export type SalesView = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly sales: readonly PublicSale[] } | { readonly kind: 'missing' };

export const AUCTION_WATCH: { readonly everyMs: number } = {
  everyMs: 120_000,
};

export function peekDue(peekedAt: number | null, now: number, mine: MyAuction | null): boolean {
  if (peekedAt === null) return true;
  if (mine === null) return now - peekedAt >= AUCTION_WATCH.everyMs;
  return mine.listings.length > 0 && now - peekedAt >= AUCTION_WATCH.everyMs;
}

export type LineTone = 'note' | 'done' | 'refusal';

export interface AuctionLine {
  readonly text: string;
  readonly tone: LineTone;
}

export type ChoiceField = 'slot' | 'rarity' | 'sort';

export const SORTS: readonly AuctionSort[] = ['price', 'newest'];

export function choiceFilter(field: ChoiceField, value: string): Partial<AuctionFilters> {
  if (field === 'slot') return { slot: ITEM_SLOTS.find((each: string): boolean => each === value) ?? null };
  if (field === 'rarity') return { rarity: value === '' ? null : value };
  return { sort: SORTS.find((each: AuctionSort): boolean => each === value) ?? 'price' };
}

export const FIRST_PAGE: AuctionFilters = { slot: null, rarity: null, minLevel: null, maxLevel: null, maxPrice: null, sort: 'price', page: 1 };

const MS_PER_MINUTE: number = 60_000;
const MINUTES_PER_HOUR: number = 60;
const PERCENT: number = 100;

const REFUSAL_LINES: Readonly<Record<AuctionRefusal, string>> = {
  bad_request: '경매인이 알아듣지 못했다.',
  bad_price: '그 가격은 허용되지 않는다.',
  no_such_listing: '그 등록품은 존재하지 않는다.',
  listing_gone: '그 등록품은 사라졌다.',
  price_changed: '가격이 바뀌었다. 다시 확인하라.',
  own_listing: '그것은 그대의 등록품이다.',
  not_enough_gold: '골드가 부족하다.',
  not_listable: '그 아이템은 등록할 수 없다.',
  no_character: '경매장에는 저장된 캐릭터가 필요하다.',
  too_many_listings: '등록 가능한 만큼 이미 등록했다.',
  level_too_low: '아직 이곳에서 팔기에는 이르다.',
  rate_limited: '너무 빠르다. 잠시 기다려라.',
  unauthorized: '세션이 끝났다. 새로고침해서 계속하라.',
};

const PICK_LINES: Readonly<Record<ListRefusal, string>> = {
  empty: '가방이나 보관함에서 아이템을 골라라.',
  unverified: '이 아이템은 기록된 적이 없어 팔 수 없다. 상인에게 산 것과 일부 초반·오프라인 획득품은 기록되지 않는다.',
  story: '이것은 팔 수 없다.',
  unidentified: '미확인 아이템은 등록할 수 없다. 먼저 확인을 받아라.',
};

export const RECORDING_LINE: AuctionLine = { text: '이 아이템은 아직 기록 중이다. 잠시 후 다시 시도하라.', tone: 'note' };

export const AUCTION_LINES: {
  readonly closed: AuctionLine;
  readonly failed: AuctionLine;
  readonly noRoom: AuctionLine;
  readonly listed: AuctionLine;
  readonly bought: AuctionLine;
  readonly cancelled: AuctionLine;
  readonly nothing: AuctionLine;
  readonly pick: AuctionLine;
} = {
  closed: { text: '경매장이 닫혀 있다.', tone: 'refusal' },
  failed: { text: '경매인이 응답하지 않았다. 아무것도 바뀌지 않았다.', tone: 'refusal' },
  noRoom: { text: '먼저 가방이나 보관함에 자리를 만들어라.', tone: 'refusal' },
  listed: { text: 'Listed.', tone: 'done' },
  bought: { text: 'Bought.', tone: 'done' },
  cancelled: { text: '아이템이 돌아왔다.', tone: 'done' },
  nothing: { text: '기다리는 것이 없다.', tone: 'note' },
  pick: { text: PICK_LINES.empty, tone: 'note' },
};

export function refusalLine(code: AuctionRefusal, rules: AuctionRules | null): AuctionLine {
  if (code === 'level_too_low' && rules !== null && rules.sellLevel > 0) return { text: `판매는 레벨 ${rules.sellLevel}부터.`, tone: 'refusal' };
  if (code === 'too_many_listings' && rules !== null) return { text: `등록 ${rules.maxListings}개가 모두 열려 있다. 하나를 취소하거나 팔릴 때까지 기다려라.`, tone: 'refusal' };
  return { text: REFUSAL_LINES[code], tone: 'refusal' };
}

export function suggestionLine(basis: PriceBasis): string {
  if (basis.kind === 'default') return '추정 가격: 아직 비슷한 아이템이 없다';
  return basis.count === 1 ? '비슷한 아이템 1개로 추정' : `비슷한 아이템 ${basis.count}개로 추정`;
}

export function listedLine(open: number, rules: AuctionRules): string {
  return `${Math.min(open, rules.maxListings)}/${rules.maxListings} 등록`;
}

export const UNSELLABLE_HINT: string = "Can't be sold here: never recorded";

export function pickLine(reason: ListRefusal): AuctionLine {
  return { text: PICK_LINES[reason], tone: reason === 'empty' ? 'note' : 'refusal' };
}

export function priceLine(rules: AuctionRules | null): AuctionLine {
  return rules === null ? { text: '가격을 정수 골드로 정하라.', tone: 'refusal' } : { text: `가격을 ${rules.minPrice}~${rules.maxPrice} 골드로 정하라.`, tone: 'refusal' };
}

export function collectedLine(gold: number, items: number): AuctionLine {
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold} 골드`);
  if (items > 0) parts.push(items === 1 ? '아이템 1개' : `아이템 ${items}개`);
  return parts.length === 0 ? AUCTION_LINES.nothing : { text: `${parts.join(', ')} 찾음.`, tone: 'done' };
}

export function parsePrice(text: string, rules: AuctionRules | null): number | null {
  const trimmed: string = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const price: number = Number(trimmed);
  if (!Number.isSafeInteger(price) || price < 1) return null;
  if (rules !== null && (price < rules.minPrice || price > rules.maxPrice)) return null;
  return price;
}

export function parseLevel(text: string): number | null {
  const trimmed: string = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const level: number = Number(trimmed);
  return Number.isSafeInteger(level) && level >= 1 ? level : null;
}

export function timeLeft(endsAt: string, now: number): string {
  const minutes: number = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / MS_PER_MINUTE));
  if (minutes <= 0) return '마감 임박';
  if (minutes < MINUTES_PER_HOUR) return `${minutes}분 남음`;
  const hours: number = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest: number = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `${hours}시간 남음` : `${hours}시간 ${rest}분 남음`;
}

export function termsLine(rules: AuctionRules): string {
  const cut: number = Math.round(rules.cut * PERCENT);
  const hours: string = `등록은 ${rules.lifeHours}시간 유지된다.`;
  return cut > 0 ? `수수료는 판매가의 ${cut}%. ${hours}` : hours;
}

export function proceeds(price: number, rules: AuctionRules | null): number {
  return rules === null ? price : price - Math.floor(price * rules.cut);
}

export function saleLine(sale: Sale): string {
  if (sale.outcome === 'cancelled') return '취소됨';
  if (sale.outcome === 'expired') return sale.collected ? '만료됨 · 돌아옴' : '만료됨 · 대기 중';
  return sale.collected ? `${sale.price}에 판매 · ${sale.proceeds} 수령` : `${sale.price}에 판매 · ${sale.proceeds} 대기`;
}

const SOMEONE: string = '누군가';
const MINUTES_PER_DAY: number = 1440;

export function agoLine(at: string, now: number): string {
  const minutes: number = Math.max(0, Math.floor((now - Date.parse(at)) / MS_PER_MINUTE));
  if (minutes < 1) return '방금';
  if (minutes < MINUTES_PER_HOUR) return `${minutes}분 전`;
  if (minutes < MINUTES_PER_DAY) return `${Math.floor(minutes / MINUTES_PER_HOUR)}시간 전`;
  return `${Math.floor(minutes / MINUTES_PER_DAY)}일 전`;
}

export function tradeLine(sale: PublicSale): string {
  const seller: string = sale.seller ?? SOMEONE;
  const buyer: string = sale.buyer ?? SOMEONE;
  if (sale.you === 'seller') return `${buyer}에게 판매`;
  if (sale.you === 'buyer') return `${seller}에게서 구매`;
  return `${seller} → ${buyer}`;
}

export function waitingCue(gold: number): string {
  return gold > 0 ? `경매인에게 ${gold}` : '';
}

export interface ShownItems {
  shown(item: LedgerItem): ItemInstance;
}

export function createShownItems(): ShownItems {
  const uids: Map<string, number> = new Map<string, number>();
  return {
    shown(item: LedgerItem): ItemInstance {
      const known: number | undefined = uids.get(item.id);
      const uid: number = known ?? -(uids.size + 1);
      if (known === undefined) uids.set(item.id, uid);
      return { uid, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes, ledger: item.id };
    },
  };
}
