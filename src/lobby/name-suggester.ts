import type { NameMood, NameSuggestion } from '../backend/api.ts';
import { createNamesApi } from '../backend/names-api.ts';
import type { NamesApi } from '../backend/names-api.ts';
import { readServerUrl } from '../backend/server-url.ts';
import type { ServerUrl } from '../backend/server-url.ts';
import { nameProblem, tidyName } from './lobby-model.ts';
import { drawFree, localNames, moodAt, nameKey, nearNames } from './name-pool.ts';
import type { NameBody, PickedName } from './name-pool.ts';

export const NAME_SUGGESTER: { readonly requestMs: number; readonly count: number; readonly nearCount: number; readonly lowWater: number } = { requestMs: 2500, count: 3, nearCount: 1, lowWater: 2 };

export interface SuggesterParts {
  readonly api: NamesApi | null;
  readonly hour: () => number;
  readonly random: () => number;
  readonly timeout: (ms: number) => AbortSignal;
}

export interface NameSuggester {
  warm(body: NameBody | null): Promise<void>;
  pick(body: NameBody | null): PickedName | null;
  next(body: NameBody | null): Promise<PickedName | null>;
  near(typed: string): Promise<PickedName | null>;
  refuse(name: string): void;
  suggested(name: string): boolean;
}

function takeFor(list: NameSuggestion[], mood: NameMood): NameSuggestion | null {
  const fitting: number = list.findIndex((entry: NameSuggestion): boolean => entry.mood === mood);
  const [taken] = list.splice(Math.max(0, fitting), 1);
  return taken ?? null;
}

export function createNameSuggester(parts: SuggesterParts): NameSuggester {
  const batches: Map<NameBody, NameSuggestion[]> = new Map<NameBody, NameSuggestion[]>();
  const pending: Map<NameBody, Promise<void>> = new Map<NameBody, Promise<void>>();
  const refused: Set<string> = new Set<string>();
  const offered: Set<string> = new Set<string>();

  const open = (entry: NameSuggestion): boolean => !refused.has(nameKey(entry.name)) && !offered.has(nameKey(entry.name)) && nameProblem(entry.name) === null;

  const batch = (body: NameBody | null): NameSuggestion[] => {
    if (body === null) return [];
    const kept: NameSuggestion[] = (batches.get(body) ?? []).filter(open);
    batches.set(body, kept);
    return kept;
  };

  const offer = (picked: PickedName): PickedName => {
    offered.add(nameKey(picked.name));
    return picked;
  };

  const fetchBatch = async (body: NameBody, api: NamesApi): Promise<void> => {
    const answer: readonly NameSuggestion[] | null = await api.suggest({ body, count: NAME_SUGGESTER.count, near: null }, parts.timeout(NAME_SUGGESTER.requestMs));
    if (answer === null) return;
    const kept: NameSuggestion[] = batch(body);
    const known: Set<string> = new Set<string>(kept.map((entry: NameSuggestion): string => nameKey(entry.name)));
    for (const entry of answer.filter(open)) {
      if (known.has(nameKey(entry.name))) continue;
      known.add(nameKey(entry.name));
      kept.push(entry);
    }
  };

  const warm = (body: NameBody | null): Promise<void> => {
    const api: NamesApi | null = parts.api;
    if (api === null || body === null || batch(body).length >= NAME_SUGGESTER.lowWater) return Promise.resolve();
    const running: Promise<void> | undefined = pending.get(body);
    if (running !== undefined) return running;
    const started: Promise<void> = fetchBatch(body, api).finally((): void => {
      pending.delete(body);
    });
    pending.set(body, started);
    return started;
  };

  const pick = (body: NameBody | null): PickedName | null => {
    const mood: NameMood = moodAt(parts.hour());
    const fromServer: NameSuggestion | null = takeFor(batch(body), mood);
    void warm(body);
    if (fromServer !== null) return offer(fromServer);
    const skipped: ReadonlySet<string> = new Set<string>([...refused, ...offered]);
    const local: string | null = drawFree(localNames(body, mood), parts.random, skipped);
    return local === null ? null : offer({ name: local, mood });
  };

  const nearFromServer = async (typed: string, mood: NameMood): Promise<PickedName | null | undefined> => {
    if (parts.api === null) return undefined;
    const answer: readonly NameSuggestion[] | null = await parts.api.suggest({ body: null, count: NAME_SUGGESTER.nearCount, near: typed }, parts.timeout(NAME_SUGGESTER.requestMs));
    if (answer === null) return undefined;
    return takeFor(answer.filter(open), mood);
  };

  return {
    warm,
    pick,
    async next(body: NameBody | null): Promise<PickedName | null> {
      if (batch(body).length === 0) await warm(body);
      return pick(body);
    },
    async near(typed: string): Promise<PickedName | null> {
      const wanted: string = tidyName(typed);
      if (nameProblem(wanted) !== null) return null;
      const mood: NameMood = moodAt(parts.hour());
      const served: PickedName | null | undefined = await nearFromServer(wanted, mood);
      if (served !== undefined) return served === null ? null : offer(served);
      const skipped: ReadonlySet<string> = new Set<string>([...refused, ...offered]);
      const local: string | null = drawFree(nearNames(wanted, mood), parts.random, skipped);
      return local === null ? null : offer({ name: local, mood });
    },
    refuse(name: string): void {
      refused.add(nameKey(tidyName(name)));
    },
    suggested(name: string): boolean {
      return offered.has(nameKey(tidyName(name)));
    },
  };
}

export function createBrowserSuggester(serverUrl: string | undefined): NameSuggester {
  const server: ServerUrl = readServerUrl(serverUrl);
  const api: NamesApi | null = server.kind === 'ok' ? createNamesApi(server.url, (url: string, init: RequestInit): Promise<Response> => fetch(url, init)) : null;
  return createNameSuggester({ api, hour: (): number => new Date().getHours(), random: Math.random, timeout: (ms: number): AbortSignal => AbortSignal.timeout(ms) });
}
