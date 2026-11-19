import type { CreateRefusal } from '../backend/characters-api.ts';
import type { RemoveOutcome } from '../backend/roster-store.ts';
import { ROSTER } from '../backend/roster.ts';
import type { Roster, Slot } from '../backend/roster.ts';
import { NAME_MESSAGES } from './lobby-model.ts';

export const STRIP_TEXT = {
  heading: '캐릭터',
  unnamed: '깨어난 이',
  fresh: '아직 깨어나지 않음',
  levelLabel: '레벨',
  newCharacter: '새 캐릭터',
  newDetail: '이름, 그리고 깨어나는 이',
  firstFirst: '먼저 첫 캐릭터를 만들거나 이름 지어라.',
  offAccount: '계정에 빈 칸이 없다',
  create: '만들기',
  cancel: '취소',
  choose: '골라 주기',
  placeholder: '이름',
  full: '이 계정에는 이미 캐릭터가 세 개 있다.',
  unreachable: '서버에 닿지 못했다. 잠시 후 다시 시도하라.',
  deleteLabel: '캐릭터 삭제',
  deleteYes: '완전히 삭제',
  startOverYes: '지우고 처음부터',
  keep: '이 캐릭터 지키기',
  listed: '아직 경매장 일이 남아 있다. 등록을 취소하고 기다리는 것을 먼저 찾아가라.',
  offline: '서버에 닿지 못해 아무것도 삭제되지 않았다. 잠시 후 다시 시도하라.',
} as const;

export interface HeroNames {
  readonly name: (id: string) => string | null;
}

export type CardView =
  | { readonly kind: 'character'; readonly key: string; readonly name: string; readonly detail: string; readonly active: boolean; readonly note: string | null }
  | { readonly kind: 'empty'; readonly key: string; readonly name: string; readonly detail: string; readonly open: boolean; readonly note: string | null };

export interface LiveCharacter {
  readonly name: string | null;
  readonly hero: string | null;
  readonly level: number | null;
}

export interface StripFacts {
  readonly roster: Roster;
  readonly heroes: HeroNames;
  readonly firstOnServer: boolean;
  readonly accountFull: boolean;
  readonly live: LiveCharacter;
}

export const EMPTY_KEY: string = 'new';

function shownSlot(slot: Slot, facts: StripFacts): Slot {
  if (slot.key !== facts.roster.active) return slot;
  return { ...slot, name: facts.live.name ?? slot.name, hero: facts.live.hero, level: facts.live.level };
}

function detailOf(slot: Slot, heroes: HeroNames): string {
  const hero: string | null = slot.hero === null ? null : heroes.name(slot.hero);
  if (slot.level === null) return hero === null ? STRIP_TEXT.fresh : `${STRIP_TEXT.fresh} · ${hero}`;
  return hero === null ? `${STRIP_TEXT.levelLabel} ${slot.level}` : `${STRIP_TEXT.levelLabel} ${slot.level} · ${hero}`;
}

export function canCreate(facts: StripFacts): boolean {
  return facts.roster.slots.length < ROSTER.max && facts.firstOnServer;
}

export function stripCards(facts: StripFacts): readonly CardView[] {
  const cards: CardView[] = facts.roster.slots.map((stored: Slot): CardView => {
    const slot: Slot = shownSlot(stored, facts);
    return {
      kind: 'character',
      key: slot.key,
      name: slot.name ?? STRIP_TEXT.unnamed,
      detail: detailOf(slot, facts.heroes),
      active: slot.key === facts.roster.active,
      note: slot.id === null && !slot.legacy && facts.accountFull ? STRIP_TEXT.offAccount : null,
    };
  });
  if (facts.roster.slots.length < ROSTER.max) {
    const open: boolean = canCreate(facts);
    cards.push({ kind: 'empty', key: EMPTY_KEY, name: STRIP_TEXT.newCharacter, detail: STRIP_TEXT.newDetail, open, note: open ? null : STRIP_TEXT.firstFirst });
  }
  return cards;
}

export function sameCards(left: readonly CardView[] | null, right: readonly CardView[]): boolean {
  if (left === null || left.length !== right.length) return false;
  return left.every((card: CardView, index: number): boolean => {
    const other: CardView | undefined = right[index];
    if (other === undefined || card.kind !== other.kind) return false;
    if (card.key !== other.key || card.name !== other.name || card.detail !== other.detail || card.note !== other.note) return false;
    if (card.kind === 'character' && other.kind === 'character') return card.active === other.active;
    if (card.kind === 'empty' && other.kind === 'empty') return card.open === other.open;
    return false;
  });
}

export function createRefusalText(reason: CreateRefusal): string {
  return reason === 'character_limit' ? STRIP_TEXT.full : NAME_MESSAGES[reason];
}

export interface DeleteWording {
  readonly ask: string;
  readonly yes: string;
}

export function deleteWording(name: string, only: boolean): DeleteWording {
  if (only) return { ask: `처음부터 시작? ${name} 및 소지품 전부가 완전히 사라진다.`, yes: STRIP_TEXT.startOverYes };
  return { ask: `${name} 삭제? 이 캐릭터와 소지품 전부가 완전히 사라진다.`, yes: STRIP_TEXT.deleteYes };
}

export function removeRefusalText(outcome: RemoveOutcome, name: string): string | null {
  if (outcome === 'removed') return null;
  return outcome === 'listed' ? `${name} ${STRIP_TEXT.listed}` : STRIP_TEXT.offline;
}
