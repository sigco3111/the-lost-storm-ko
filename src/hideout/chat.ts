import type { FriendResult, NameResult, ReportResult } from '../backend/api.ts';
import { NAME_MESSAGES } from '../lobby/lobby-model.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine, ChatRefusal, WhisperDirection, WhisperRefusal } from '../backend/live-protocol.ts';
import type { ChatCommand } from './chat-command.ts';
import { nameKey } from './chat-command.ts';

export const CHAT = { keep: 120, names: 200 } as const;

export const CHAT_DAYS = {
  today: '오늘',
  yesterday: '어제',
  months: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
} as const;

export const CHAT_WORDS = {
  general: '일반',
  hint: '/dm 이름으로 귓속말, /r로 답장, /g로 일반으로.',
  help: '/dm 이름 메시지로 한 명에게 귓속말. /r 메시지로 마지막 귓속말에 답장. /g로 일반으로 돌아간다. 띄어쓰기 있는 이름은 따옴표로 묶어라.',
  noWhispers: '귓속말은 아직 쓸 수 없다.',
  noReply: '아직 귓속말이 없다.',
} as const;

export type NoteKind = 'plain' | 'name' | 'hint';

export type ChatScope = 'everyone' | 'hideout';

export type ChatTarget = { readonly kind: 'general' } | { readonly kind: 'whisper'; readonly name: string };

export const GENERAL: ChatTarget = { kind: 'general' };

export type ChatEntry =
  | { readonly kind: 'line'; readonly key: string; readonly line: ChatLine; readonly own: boolean }
  | { readonly kind: 'whisper'; readonly key: string; readonly line: ChatLine; readonly dir: WhisperDirection; readonly with: string }
  | { readonly kind: 'note'; readonly key: string; readonly text: string; readonly note: NoteKind };

export interface ChatState {
  readonly entries: readonly ChatEntry[];
  readonly you: string | null;
  readonly me: string | null;
  readonly notes: number;
  readonly scope: ChatScope | null;
  readonly target: ChatTarget;
  readonly replyTo: string | null;
  readonly names: readonly string[];
}

export const EMPTY_CHAT: ChatState = { entries: [], you: null, me: null, notes: 0, scope: null, target: GENERAL, replyTo: null, names: [] };

export type ChatAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'say'; readonly text: string }
  | { readonly kind: 'whisper'; readonly to: string; readonly text: string };

export interface ChatStep {
  readonly state: ChatState;
  readonly action: ChatAction;
  readonly keepOpen: boolean;
}

const REFUSAL_TEXT: Readonly<Record<ChatRefusal, string>> = {
  slow_down: '너무 빠르다. 잠시 기다려라.',
  blocked: '그 글은 보내지지 않았다.',
  name_needed: '말할 이름을 골라라.',
  bad_text: '그 글은 보낼 수 없다.',
};

const REPORT_TEXT: Readonly<Record<ReportResult, string>> = {
  reported: '신고했다. 고맙다.',
  gone: '그 글은 사라졌다.',
  own: '그대의 글이다.',
  slow: '신고가 너무 많다. 나중에 다시 시도하라.',
  unsupported: '여기서는 신고할 수 없다.',
  failed: '신고를 보내지 못했다.',
};

export function refusalText(reason: ChatRefusal): string {
  return REFUSAL_TEXT[reason];
}

export function unsentText(reason: WhisperRefusal, to: string): string {
  switch (reason) {
    case 'no_such_player':
      return `No one is called ${to}. Put a name with spaces in quotes: /dm "재를 걷는 자" hello`;
    case 'offline':
      return `${to} is not online.`;
    case 'ignored':
      return `${to} is not taking your whispers.`;
    case 'self':
      return '그것은 그대다.';
    case 'slow_down':
      return '너무 빠르다. 잠시 기다려라.';
    case 'blocked':
      return '그 귓속말은 보내지지 않았다.';
    case 'bad_text':
      return '그 귓속말은 보낼 수 없다.';
    case 'name_needed':
      return '귓속말할 이름을 골라라.';
  }
  return '그 귓속말은 보내지지 않았다.';
}

export function reportText(result: ReportResult): string {
  return REPORT_TEXT[result];
}

export function friendText(result: FriendResult, name: string): string {
  switch (result.kind) {
    case 'ok':
      return result.state === 'friends' ? `You and ${name} are friends.` : `Friend request sent to ${name}.`;
    case 'unsupported':
      return '여기서는 친구를 쓸 수 없다.';
    case 'failed':
      return '요청을 보내지 못했다.';
    case 'refused':
      switch (result.reason) {
        case 'name_needed':
          return '먼저 이름을 골라라.';
        case 'own_name':
          return '그것은 그대다.';
        case 'no_such_character':
          return `${name}이라는 이는 없다.`;
        case 'friend_limit':
          return '친구 목록이 가득 찼다.';
        case 'no_such_request':
          return `${name} has no request waiting.`;
      }
  }
  return '요청을 보내지 못했다.';
}

export function renameText(result: NameResult): string {
  switch (result.kind) {
    case 'ok':
      return `You are ${result.name} now. Say it again.`;
    case 'invalid':
      return NAME_MESSAGES[result.reason];
    case 'limited':
      return NAME_MESSAGES.limited;
    case 'unauthorized':
    case 'refused':
    case 'retry':
      return NAME_MESSAGES.unavailable;
  }
  return NAME_MESSAGES.unavailable;
}

interface Day {
  readonly year: number;
  readonly month: number;
  readonly date: number;
}

function dayOf(ms: number): Day {
  const moment: Date = new Date(ms);
  return { year: moment.getFullYear(), month: moment.getMonth(), date: moment.getDate() };
}

function sameDay(left: Day, right: Day): boolean {
  return left.year === right.year && left.month === right.month && left.date === right.date;
}

function stampOf(at: string | null): number | null {
  if (at === null) return null;
  const parsed: number = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dayLabel(at: number, now: number): string {
  const day: Day = dayOf(at);
  const today: Day = dayOf(now);
  if (sameDay(day, today)) return CHAT_DAYS.today;
  const before: Date = new Date(today.year, today.month, today.date - 1);
  if (sameDay(day, dayOf(before.getTime()))) return CHAT_DAYS.yesterday;
  const named: string = `${String(day.date)} ${CHAT_DAYS.months[day.month] ?? ''}`;
  return day.year === today.year ? named : `${named} ${String(day.year)}`;
}

export function dayDivider(previous: string | null, at: string | null, now: number): string | null {
  const stamp: number | null = stampOf(at);
  if (stamp === null) return null;
  const earlier: number | null = stampOf(previous);
  if (earlier === null ? sameDay(dayOf(stamp), dayOf(now)) : sameDay(dayOf(stamp), dayOf(earlier))) return null;
  return dayLabel(stamp, now);
}

export function readers(state: ChatState): string {
  if (state.target.kind === 'whisper') return `Only you and ${state.target.name} read this.`;
  return state.scope === 'hideout' ? '은신처의 모두가 읽는다.' : '접속한 모두가 읽는다.';
}

export function destination(aim: ChatTarget): string {
  return aim.kind === 'whisper' ? `To ${aim.name}` : `To ${CHAT_WORDS.general}`;
}

function isOwn(line: ChatLine, state: ChatState): boolean {
  if (line.own !== null) return line.own;
  return line.from !== null && (line.from === state.you || line.from === state.me);
}

function kept(entries: readonly ChatEntry[]): readonly ChatEntry[] {
  return entries.slice(-CHAT.keep);
}

export function withName(state: ChatState, name: string): ChatState {
  const key: string = nameKey(name);
  if (key === '') return state;
  const others: readonly string[] = state.names.filter((known: string): boolean => nameKey(known) !== key);
  return { ...state, names: [...others, name].slice(-CHAT.names) };
}

function withEntries(state: ChatState, fresh: readonly ChatEntry[]): ChatState {
  const known: ReadonlySet<string> = new Set<string>(state.entries.map((entry: ChatEntry): string => entry.key));
  const added: readonly ChatEntry[] = fresh.filter((entry: ChatEntry): boolean => !known.has(entry.key));
  if (added.length === 0) return state;
  let next: ChatState = { ...state, entries: kept([...state.entries, ...added]) };
  for (const entry of added) if (entry.kind !== 'note') next = withName(next, entry.kind === 'whisper' ? entry.with : entry.line.name);
  return next;
}

function withLines(state: ChatState, lines: readonly ChatLine[]): ChatState {
  return withEntries(
    state,
    lines.map((line: ChatLine): ChatEntry => ({ kind: 'line', key: `line-${String(line.id)}`, line, own: isOwn(line, state) })),
  );
}

export function addNote(state: ChatState, text: string, note: NoteKind = 'plain'): ChatState {
  const notes: number = state.notes + 1;
  return { ...state, notes, entries: kept([...state.entries, { kind: 'note', key: `note-${String(notes)}`, text, note }]) };
}

export function receive(state: ChatState, event: LiveEvent): ChatState {
  switch (event.type) {
    case 'welcome':
      return withLines({ ...state, me: event.you, scope: 'everyone' }, event.chat);
    case 'present':
      return event.chat === null ? state : withLines({ ...state, you: event.you, scope: state.scope ?? 'hideout' }, event.chat);
    case 'said':
      return withLines(state, [event.line]);
    case 'whisper': {
      const entry: ChatEntry = { kind: 'whisper', key: `whisper-${String(event.line.id)}`, line: event.line, dir: event.dir, with: event.with };
      const next: ChatState = withEntries(state, [entry]);
      return event.dir === 'from' && next !== state ? { ...next, replyTo: event.with } : next;
    }
    case 'unsent':
      return addNote(state, unsentText(event.reason, event.to), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'refused':
      return addNote(state, refusalText(event.reason), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'joined':
      return withName(state, event.player.name);
    case 'look':
      return event.name === null ? state : withName(state, event.name);
    case 'left':
    case 'moves':
    case 'friends':
    case 'trade':
    case 'away':
    case 'gone':
      return state;
  }
  return state;
}

export function target(state: ChatState, next: ChatTarget): ChatState {
  if (next.kind === 'general') return state.target.kind === 'general' ? state : { ...state, target: GENERAL };
  return withName({ ...state, target: next }, next.name);
}

function whisperTo(state: ChatState, name: string, text: string | null): ChatStep {
  if (state.scope !== 'everyone') return { state: addNote(state, CHAT_WORDS.noWhispers), action: { kind: 'none' }, keepOpen: false };
  const aimed: ChatState = target(state, { kind: 'whisper', name });
  return text === null ? { state: aimed, action: { kind: 'none' }, keepOpen: true } : { state: aimed, action: { kind: 'whisper', to: name, text }, keepOpen: false };
}

export function command(state: ChatState, parsed: ChatCommand): ChatStep {
  switch (parsed.kind) {
    case 'empty':
      return { state, action: { kind: 'none' }, keepOpen: false };
    case 'say':
      return state.target.kind === 'whisper' ? whisperTo(state, state.target.name, parsed.text) : { state, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    case 'general': {
      const back: ChatState = target(state, GENERAL);
      return parsed.text === null ? { state: back, action: { kind: 'none' }, keepOpen: true } : { state: back, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    }
    case 'whisper':
      return whisperTo(state, parsed.name, parsed.text);
    case 'reply':
      return state.replyTo === null ? { state: addNote(state, CHAT_WORDS.noReply), action: { kind: 'none' }, keepOpen: false } : whisperTo(state, state.replyTo, parsed.text);
    case 'help':
      return { state: addNote(state, CHAT_WORDS.help, 'hint'), action: { kind: 'none' }, keepOpen: false };
    case 'no_name':
      return { state: addNote(state, `Name a player: ${parsed.command} name message`), action: { kind: 'none' }, keepOpen: false };
    case 'unknown':
      return { state: addNote(state, `${parsed.command} is not a command. Try /dm name, /r or /g.`), action: { kind: 'none' }, keepOpen: false };
  }
  return { state, action: { kind: 'none' }, keepOpen: false };
}

export function speaker(entry: ChatEntry): string | null {
  switch (entry.kind) {
    case 'line':
      return entry.own ? null : entry.line.name;
    case 'whisper':
      return entry.with;
    case 'note':
      return null;
  }
  return null;
}
