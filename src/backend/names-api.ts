import { isFields } from '../../sim/content/read.ts';
import { exchange, succeeded } from './api.ts';
import type { Answer, FetchFn, NameMood, NameSuggestion } from './api.ts';

export interface SuggestQuery {
  readonly body: 'man' | 'woman' | null;
  readonly count: number;
  readonly near: string | null;
}

export interface NamesApi {
  suggest(query: SuggestQuery, signal: AbortSignal): Promise<readonly NameSuggestion[] | null>;
}

export const NAMES_API: { readonly path: string; readonly listed: number; readonly nameChars: number } = { path: '/v1/names/suggest', listed: 40, nameChars: 16 };

const MOODS: readonly NameMood[] = ['night', 'small-hours', 'dawn', 'day', 'dusk'];

function readSuggestion(value: unknown): readonly NameSuggestion[] {
  if (!isFields(value)) return [];
  const name: unknown = value['name'];
  const mood: unknown = value['mood'];
  if (typeof name !== 'string' || name === '' || name.length > NAMES_API.nameChars) return [];
  const known: NameMood | undefined = MOODS.find((entry: NameMood): boolean => entry === mood);
  if (known === undefined && mood !== null) return [];
  return [{ name, mood: known ?? null }];
}

export function readSuggestions(value: unknown): readonly NameSuggestion[] | null {
  if (!isFields(value)) return null;
  const list: unknown = value['suggestions'];
  if (!Array.isArray(list)) return null;
  const items: readonly unknown[] = list;
  return items.slice(0, NAMES_API.listed).flatMap(readSuggestion);
}

export function suggestPath(query: SuggestQuery): string {
  const params: URLSearchParams = new URLSearchParams({ count: String(query.count) });
  if (query.body !== null) params.set('body', query.body);
  if (query.near !== null) params.set('near', query.near);
  return `${NAMES_API.path}?${params.toString()}`;
}

export function createNamesApi(baseUrl: string, fetchFn: FetchFn): NamesApi {
  return {
    async suggest(query: SuggestQuery, signal: AbortSignal): Promise<readonly NameSuggestion[] | null> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}${suggestPath(query)}`, { method: 'GET', signal });
      return succeeded(answer) ? readSuggestions(answer.body) : null;
    },
  };
}
