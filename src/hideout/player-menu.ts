import type { FriendsList } from '../backend/api.ts';

export const PLAYER_MENU = {
  reach: 14,
  edgeGutter: 16,
  soon: '곧',
} as const;

export type FriendStanding = 'none' | 'requested' | 'incoming' | 'friends' | 'unknown';

export type EntryId = 'profile' | 'message' | 'trade' | 'friend' | 'mute' | 'block' | 'report';

export type MenuStep = 'entries' | 'confirm_block' | 'report';

export type TradeStanding = 'ready' | 'unsupported' | 'trading' | 'elsewhere' | 'away' | 'far';

export interface TradeWatch {
  readonly supported: boolean;
  readonly trading: boolean;
  readonly inHideout: boolean;
  readonly here: boolean;
  readonly distance: number | null;
}

export interface MenuFacts {
  readonly friend: FriendStanding;
  readonly friendsAvailable: boolean;
  readonly muted: boolean;
  readonly blocked: boolean;
  readonly blocksAvailable: boolean;
  readonly reportAvailable: boolean;
  readonly canMessage: boolean;
  readonly canProfile: boolean;
  readonly trade: TradeStanding;
  readonly reported: boolean;
  readonly busy: ReadonlySet<EntryId>;
}

export interface MenuEntry {
  readonly id: EntryId;
  readonly label: string;
  readonly detail: string;
  readonly enabled: boolean;
  readonly soon: boolean;
}

export type MenuAction =
  | { readonly type: 'profile' }
  | { readonly type: 'message' }
  | { readonly type: 'trade' }
  | { readonly type: 'befriend' }
  | { readonly type: 'accept' }
  | { readonly type: 'mute' }
  | { readonly type: 'unmute' }
  | { readonly type: 'ask_block' }
  | { readonly type: 'unblock' }
  | { readonly type: 'ask_report' };

export type CloseReason = 'escape' | 'outside' | 'left' | 'far' | 'offscreen' | 'zone';

export interface Watch {
  readonly here: boolean;
  readonly inHideout: boolean;
  readonly distance: number | null;
  readonly anchor: MenuAnchor | null;
  readonly view: { readonly width: number; readonly height: number };
}

export interface MenuAnchor {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export function friendStanding(list: FriendsList | null, name: string): FriendStanding {
  if (list === null) return 'unknown';
  const key: string = name.toLowerCase();
  const same = (other: string): boolean => other.toLowerCase() === key;
  if (list.friends.some((entry): boolean => same(entry.name))) return 'friends';
  if (list.incoming.some(same)) return 'incoming';
  if (list.outgoing.some(same)) return 'requested';
  return 'none';
}

function friendEntry(facts: MenuFacts): MenuEntry {
  const busy: boolean = facts.busy.has('friend');
  const open: boolean = facts.friendsAvailable && !facts.blocked && !busy;
  switch (facts.friend) {
    case 'friends':
      return { id: 'friend', label: '친구', detail: '친구 사이', enabled: false, soon: false };
    case 'requested':
      return { id: 'friend', label: '요청 보냄', detail: '기다리는 중', enabled: false, soon: false };
    case 'incoming':
      return { id: 'friend', label: '요청 수락', detail: '친구를 청했다', enabled: open, soon: false };
    case 'none':
    case 'unknown':
      return { id: 'friend', label: '친구 추가', detail: facts.blocked ? '먼저 차단을 해제하라' : '친구 요청 보내기', enabled: open && facts.friend === 'none', soon: false };
  }
  return { id: 'friend', label: '친구 추가', detail: '친구 요청 보내기', enabled: false, soon: false };
}

export function tradeStanding(watch: TradeWatch): TradeStanding {
  if (!watch.supported) return 'unsupported';
  if (watch.trading) return 'trading';
  if (!watch.inHideout) return 'elsewhere';
  if (!watch.here) return 'away';
  if (watch.distance === null || watch.distance > PLAYER_MENU.reach) return 'far';
  return 'ready';
}

function tradeDetail(facts: MenuFacts): string {
  if (facts.trade !== 'unsupported' && facts.blocked) return '먼저 차단을 해제하라';
  switch (facts.trade) {
    case 'ready':
      return '아이템·골드 제안';
    case 'unsupported':
      return PLAYER_MENU.soon;
    case 'trading':
      return '먼저 지금 거래를 마쳐라';
    case 'elsewhere':
      return '은신처에서만';
    case 'away':
      return '은신처에 없다';
    case 'far':
      return '가까이 걸어가라';
  }
  return PLAYER_MENU.soon;
}

function tradeEntry(facts: MenuFacts): MenuEntry {
  return { id: 'trade', label: '거래', detail: tradeDetail(facts), enabled: facts.trade === 'ready' && !facts.blocked && !facts.busy.has('trade'), soon: facts.trade === 'unsupported' };
}

export function menuEntries(facts: MenuFacts): readonly MenuEntry[] {
  const busy = (id: EntryId): boolean => facts.busy.has(id);
  return [
    { id: 'profile', label: '프로필', detail: facts.canProfile ? '무엇을 입고 얼마나 멀리 왔는지' : PLAYER_MENU.soon, enabled: facts.canProfile, soon: !facts.canProfile },
    { id: 'message', label: '메시지', detail: facts.canMessage ? '따로 글을 보내기' : PLAYER_MENU.soon, enabled: facts.canMessage && !facts.blocked, soon: !facts.canMessage },
    tradeEntry(facts),
    friendEntry(facts),
    { id: 'mute', label: facts.muted ? '음소거 해제' : '음소거', detail: facts.muted ? '채팅 다시 보기' : '채팅 숨기기', enabled: true, soon: false },
    { id: 'block', label: facts.blocked ? '차단 해제' : '차단', detail: facts.blocked ? '요청 다시 받기' : '숨기고 요청 거절', enabled: facts.blocksAvailable && !busy('block'), soon: false },
    { id: 'report', label: facts.reported ? '신고됨' : '신고', detail: facts.reported ? '고맙다' : '어떤 일인지 알려 달라', enabled: facts.reportAvailable && !facts.reported && !busy('report'), soon: false },
  ];
}

export function actionOf(entry: MenuEntry, facts: MenuFacts): MenuAction | null {
  if (!entry.enabled) return null;
  switch (entry.id) {
    case 'profile':
      return { type: 'profile' };
    case 'message':
      return { type: 'message' };
    case 'trade':
      return { type: 'trade' };
    case 'friend':
      return facts.friend === 'incoming' ? { type: 'accept' } : facts.friend === 'none' ? { type: 'befriend' } : null;
    case 'mute':
      return facts.muted ? { type: 'unmute' } : { type: 'mute' };
    case 'block':
      return facts.blocked ? { type: 'unblock' } : { type: 'ask_block' };
    case 'report':
      return { type: 'ask_report' };
  }
  return null;
}

export function cycle(count: number, from: number, step: 1 | -1): number {
  if (count <= 0) return -1;
  if (from < 0) return step === 1 ? 0 : count - 1;
  return (((from + step) % count) + count) % count;
}

export function closeReason(watch: Watch): CloseReason | null {
  if (!watch.inHideout) return 'zone';
  if (!watch.here) return 'left';
  if (watch.distance !== null && watch.distance > PLAYER_MENU.reach) return 'far';
  const anchor = watch.anchor;
  if (anchor === null || anchor.x < 0 || anchor.bottom < 0 || anchor.x > watch.view.width || anchor.top > watch.view.height) return 'offscreen';
  return null;
}

export interface Placed {
  readonly left: number;
  readonly top: number;
  readonly below: boolean;
}

export function placeMenu(anchor: MenuAnchor, size: { readonly width: number; readonly height: number }, view: { readonly width: number; readonly height: number }, gap: number): Placed {
  const gutter: number = PLAYER_MENU.edgeGutter;
  const left: number = Math.min(Math.max(gutter, anchor.x - size.width / 2), Math.max(gutter, view.width - gutter - size.width));
  const above: number = anchor.top - gap - size.height;
  const roomBelow: number = view.height - gutter - (anchor.bottom + gap);
  const below: boolean = above < gutter && roomBelow >= size.height;
  const top: number = below ? anchor.bottom + gap : Math.max(gutter, Math.min(above, view.height - gutter - size.height));
  return { left, top, below };
}
