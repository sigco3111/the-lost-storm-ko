import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NameSuggestion } from '../backend/api.ts';
import type { NamesApi, SuggestQuery } from '../backend/names-api.ts';
import { BYNAMES, EITHER_NAMES } from './name-pool.ts';
import type { PickedName } from './name-pool.ts';
import { createNameSuggester, NAME_SUGGESTER } from './name-suggester.ts';
import type { NameSuggester } from './name-suggester.ts';

const NIGHT_HOUR: number = 23;
const NEVER: AbortSignal = new AbortController().signal;

interface FakeApi {
  readonly api: NamesApi;
  readonly asked: SuggestQuery[];
  readonly answers: (readonly NameSuggestion[] | null)[];
  release(): void;
}

function fakeApi(held: boolean = false): FakeApi {
  const asked: SuggestQuery[] = [];
  const answers: (readonly NameSuggestion[] | null)[] = [];
  const waiting: (() => void)[] = [];
  const api: NamesApi = {
    async suggest(query: SuggestQuery): Promise<readonly NameSuggestion[] | null> {
      asked.push(query);
      if (held) await new Promise<void>((resolve: () => void): void => void waiting.push(resolve));
      return answers.shift() ?? null;
    },
  };
  return {
    api,
    asked,
    answers,
    release: (): void => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

function suggester(api: NamesApi | null, hour: number = NIGHT_HOUR): NameSuggester {
  return createNameSuggester({ api, hour: (): number => hour, random: (): number => 0.5, timeout: (): AbortSignal => NEVER });
}

function must(picked: PickedName | null): PickedName {
  assert.ok(picked !== null);
  return picked;
}

void test('offline, a name comes from the local pool in the mood of the player\'s hour and never twice', (): void => {
  const names: NameSuggester = suggester(null, 3);
  const seen: Set<string> = new Set<string>();
  for (let pick: number = 0; pick < 30; pick += 1) {
    const picked: PickedName = must(names.pick('woman'));
    assert.equal(picked.mood, 'small-hours');
    assert.ok(BYNAMES['small-hours'].includes(picked.name.split(' ')[1] ?? ''));
    assert.ok(!seen.has(picked.name));
    seen.add(picked.name);
    assert.ok(names.suggested(picked.name.toUpperCase()));
  }
});

void test('with a server, the first name in the player\'s mood is taken from its free list', async (): Promise<void> => {
  const fake: FakeApi = fakeApi();
  fake.answers.push([
    { name: 'Edda Morrow', mood: 'dawn' },
    { name: 'Tobin Nightjar', mood: 'night' },
    { name: 'Ilse Vesper', mood: 'dusk' },
  ]);
  const names: NameSuggester = suggester(fake.api);
  await names.warm('man');
  assert.deepEqual(names.pick('man'), { name: 'Tobin Nightjar', mood: 'night' });
  assert.deepEqual(names.pick('man'), { name: 'Edda Morrow', mood: 'dawn' });
  assert.deepEqual(fake.asked[0], { body: 'man', count: NAME_SUGGESTER.count, near: null });
});

void test('the request never carries the hour, the mood or anything else about the player', async (): Promise<void> => {
  const fake: FakeApi = fakeApi();
  const names: NameSuggester = suggester(fake.api);
  await names.warm('woman');
  await names.near('Corvin');
  for (const query of fake.asked) assert.deepEqual(Object.keys(query).toSorted(), ['body', 'count', 'near']);
  assert.deepEqual(fake.asked[1], { body: null, count: NAME_SUGGESTER.nearCount, near: 'Corvin' });
});

void test('warming twice at once sends one request, and a pick before it lands does not wait', async (): Promise<void> => {
  const fake: FakeApi = fakeApi(true);
  fake.answers.push([{ name: 'Tobin Nightjar', mood: 'night' }]);
  const names: NameSuggester = suggester(fake.api);
  const first: Promise<void> = names.warm('man');
  const second: Promise<void> = names.warm('man');
  const early: PickedName = must(names.pick('man'));
  assert.equal(fake.asked.length, 1);
  assert.notEqual(early.name, 'Tobin Nightjar');
  fake.release();
  await Promise.all([first, second]);
  assert.equal(must(names.pick('man')).name, 'Tobin Nightjar');
});

void test('a suggested name found taken is never offered again and the next one is waited for', async (): Promise<void> => {
  const fake: FakeApi = fakeApi();
  fake.answers.push([{ name: 'Corvin Lantern', mood: 'night' }], [
    { name: 'Corvin Lantern', mood: 'night' },
    { name: 'Joren Starling', mood: 'night' },
  ]);
  const names: NameSuggester = suggester(fake.api);
  await names.warm('man');
  const first: PickedName = must(names.pick('man'));
  assert.equal(first.name, 'Corvin Lantern');
  names.refuse('corvin  lantern');
  assert.deepEqual(await names.next('man'), { name: 'Joren Starling', mood: 'night' });
});

void test('when the server cannot answer, the next name comes from the local pool', async (): Promise<void> => {
  const names: NameSuggester = suggester(fakeApi().api);
  const picked: PickedName = must(await names.next('man'));
  assert.equal(picked.mood, 'night');
});

void test('a close name for a typed one comes from the server in the player\'s mood, else from the local pool', async (): Promise<void> => {
  const fake: FakeApi = fakeApi();
  fake.answers.push([
    { name: 'Corvin Morrow', mood: 'dawn' },
    { name: 'Corvin Lantern', mood: 'night' },
  ]);
  const names: NameSuggester = suggester(fake.api);
  assert.deepEqual(await names.near(' Corvin '), { name: 'Corvin Lantern', mood: 'night' });
  assert.ok(names.suggested('Corvin Lantern'));
  const offline: PickedName = must(await names.near('Corvin'));
  assert.match(offline.name, /^Corvin [A-Z][a-z]+$/);
  assert.equal(offline.mood, 'night');
});

void test('no close name is offered when the server has none free or the typed name breaks the rules', async (): Promise<void> => {
  const fake: FakeApi = fakeApi();
  fake.answers.push([]);
  const names: NameSuggester = suggester(fake.api);
  assert.equal(await names.near('Corvin'), null);
  assert.equal(await names.near('x'), null);
  assert.equal(fake.asked.length, 1);
});

void test('before a hero is picked, a name comes from the given names that suit either, without asking the server', async (): Promise<void> => {
  const fake: FakeApi = fakeApi();
  const names: NameSuggester = suggester(fake.api);
  await names.warm(null);
  for (let pick: number = 0; pick < 12; pick += 1) {
    const picked: PickedName = must(names.pick(null));
    assert.ok(EITHER_NAMES.includes(picked.name.split(' ')[0] ?? ''));
  }
  assert.deepEqual(fake.asked, []);
});
