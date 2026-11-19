import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import { exchange, failureOf, headers, succeeded } from './api.ts';
import { RANKINGS } from './api.ts';
import type { Answer, BoardRow, FetchFn, Leaderboard, LeaderboardResult, LevelUpNote, NameRefusal, NameResult, OnlineCharacter, PresentList, Ranking, YourRow } from './api.ts';

export interface LobbyApi {
  leaderboard(token: string | null, signal: AbortSignal, by?: Ranking): Promise<LeaderboardResult>;
  rename(token: string, name: string, signal: AbortSignal): Promise<NameResult>;
}

export const LOBBY_LIMITS: { readonly rows: number; readonly levelUps: number; readonly present: number; readonly nameChars: number } = { rows: 100, levelUps: 50, present: 100, nameChars: 32 };

const NAME_REFUSALS: readonly NameRefusal[] = ['name_length', 'name_characters', 'name_blocked', 'name_taken'];

function wholeNumber(source: Fields, key: string, min: number): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function shortText(source: Fields, key: string): string | null {
  const value: unknown = source[key];
  return typeof value === 'string' && value !== '' && value.length <= LOBBY_LIMITS.nameChars ? value : null;
}

function readRow(value: unknown): BoardRow | null {
  if (!isFields(value)) return null;
  const rank: number | null = wholeNumber(value, 'rank', 1);
  const level: number | null = wholeNumber(value, 'level', 1);
  const name: string | null = shortText(value, 'name');
  const furthest: string | null = shortText(value, 'furthest');
  const online: unknown = value['online'];
  if (rank === null || level === null || name === null || furthest === null || typeof online !== 'boolean') return null;
  return { rank, name, level, damage: wholeNumber(value, 'damage', 0) ?? 0, life: wholeNumber(value, 'life', 0) ?? 0, playedMs: wholeNumber(value, 'playedMs', 0) ?? 0, kills: wholeNumber(value, 'kills', 0) ?? 0, deaths: wholeNumber(value, 'deaths', 0) ?? 0, furthest, online, account: shortText(value, 'account') };
}

function readYou(value: unknown): YourRow | null | undefined {
  if (value === null) return null;
  const row: BoardRow | null = readRow(value);
  const chosen: unknown = isFields(value) ? value['chosen'] : undefined;
  return row === null || typeof chosen !== 'boolean' ? undefined : { ...row, chosen };
}

function readLevelUp(value: unknown): LevelUpNote | null {
  if (!isFields(value)) return null;
  const name: string | null = shortText(value, 'name');
  const level: number | null = wholeNumber(value, 'level', 1);
  const minutesAgo: number | null = wholeNumber(value, 'minutesAgo', 0);
  return name === null || level === null || minutesAgo === null ? null : { name, level, minutesAgo };
}

function readOnline(value: unknown): OnlineCharacter | null {
  if (!isFields(value)) return null;
  const name: string | null = shortText(value, 'name');
  const level: number | null = wholeNumber(value, 'level', 1);
  const furthest: string | null = shortText(value, 'furthest');
  return name === null || level === null || furthest === null ? null : { name, level, furthest };
}

function distinctOnline(characters: readonly OnlineCharacter[]): readonly OnlineCharacter[] {
  const seen: Set<string> = new Set<string>();
  return characters.filter((entry: OnlineCharacter): boolean => {
    const key: string = entry.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readPresent(value: unknown): PresentList | null {
  if (!isFields(value)) return null;
  const characters: readonly OnlineCharacter[] | null = readList(value['characters'], LOBBY_LIMITS.present, readOnline);
  const more: number | null = wholeNumber(value, 'more', 0);
  const visitors: number | null = wholeNumber(value, 'visitors', 0);
  if (characters === null || more === null || visitors === null) return null;
  return { characters: distinctOnline(characters), more, visitors };
}

function readList<T>(value: unknown, limit: number, read: (entry: unknown) => T | null): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  const entries: (T | null)[] = list.slice(0, limit).map(read);
  return entries.every((entry: T | null): boolean => entry !== null) ? entries.filter((entry: T | null): entry is T => entry !== null) : null;
}

function distinctNames(rows: readonly BoardRow[]): readonly BoardRow[] {
  const seen: Set<string> = new Set<string>();
  return rows.filter((row: BoardRow): boolean => {
    const key: string = row.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readRanking(value: unknown): Ranking {
  return RANKINGS.find((ranking: Ranking): boolean => ranking === value) ?? 'level';
}

export function rankingPath(by: Ranking): string {
  return by === 'level' ? '/v1/leaderboard' : `/v1/leaderboard?by=${by}`;
}

export function readLeaderboard(value: unknown): Leaderboard | null {
  if (!isFields(value)) return null;
  const top: readonly BoardRow[] | null = readList(value['top'], LOBBY_LIMITS.rows, readRow);
  const levelUps: readonly LevelUpNote[] | null = readList(value['levelUps'], LOBBY_LIMITS.levelUps, readLevelUp);
  const you: YourRow | null | undefined = readYou(value['you']);
  const online: number | null = wholeNumber(value, 'online', 0);
  const characters: number | null = wholeNumber(value, 'characters', 0);
  if (top === null || levelUps === null || you === undefined || online === null || characters === null) return null;
  return { by: readRanking(value['by']), top: distinctNames(top), you, online, present: readPresent(value['present']), characters, levelUps };
}

function refusalOf(answer: Answer): NameRefusal | null {
  const error: unknown = isFields(answer.body) ? answer.body['error'] : null;
  const code: unknown = isFields(error) ? error['code'] : null;
  return NAME_REFUSALS.find((refusal: NameRefusal): boolean => refusal === code) ?? null;
}

export function createLobbyApi(baseUrl: string, fetchFn: FetchFn): LobbyApi {
  return {
    async leaderboard(token: string | null, signal: AbortSignal, by: Ranking = 'level'): Promise<LeaderboardResult> {
      const init: RequestInit = token === null ? { method: 'GET', signal } : { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal };
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${rankingPath(by)}`, init);
      if (!succeeded(answer)) return failureOf(answer);
      const board: Leaderboard | null = readLeaderboard(answer.body);
      return board === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', board };
    },
    async rename(token: string, name: string, signal: AbortSignal): Promise<NameResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/character/name`, { method: 'PUT', headers: headers(token), body: JSON.stringify({ name }), signal });
      if (answer !== null && (answer.status === 400 || answer.status === 409)) {
        const reason: NameRefusal | null = refusalOf(answer);
        if (reason !== null) return { kind: 'invalid', reason };
      }
      if (answer !== null && answer.status === 429) return { kind: 'limited' };
      if (!succeeded(answer)) return failureOf(answer);
      const named: string | null = isFields(answer.body) ? shortText(answer.body, 'name') : null;
      return named === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', name: named };
    },
  };
}
