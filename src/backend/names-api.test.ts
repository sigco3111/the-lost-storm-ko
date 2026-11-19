import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NameSuggestion } from './api.ts';
import { createNamesApi, readSuggestions, suggestPath } from './names-api.ts';

void test('the query carries only the count, the hero body and a typed name', (): void => {
  assert.equal(suggestPath({ body: null, count: 3, near: null }), '/v1/names/suggest?count=3');
  assert.equal(suggestPath({ body: 'woman', count: 1, near: 'Corvin Ash' }), '/v1/names/suggest?count=1&body=woman&near=Corvin+Ash');
});

void test('a suggestion list is read entry by entry and anything odd is dropped', (): void => {
  assert.equal(readSuggestions(null), null);
  assert.equal(readSuggestions({ suggestions: 'Corvin' }), null);
  const read: readonly NameSuggestion[] | null = readSuggestions({
    suggestions: [{ name: 'Tobin Nightjar', mood: 'night' }, { name: 'Corvin 7', mood: null }, { name: 'Edda Morrow', mood: 'noon' }, { name: 'A'.repeat(17), mood: 'day' }, { name: 4, mood: 'day' }, 'Wren'],
  });
  assert.deepEqual(read, [
    { name: 'Tobin Nightjar', mood: 'night' },
    { name: 'Corvin 7', mood: null },
  ]);
});

void test('a failed or refused request answers null instead of throwing', async (): Promise<void> => {
  const down = createNamesApi('https://example.test', (): Promise<Response> => Promise.reject(new Error('offline')));
  assert.equal(await down.suggest({ body: null, count: 2, near: null }, AbortSignal.timeout(1000)), null);
  const limited = createNamesApi('https://example.test', (): Promise<Response> => Promise.resolve(new Response('{}', { status: 429 })));
  assert.equal(await limited.suggest({ body: null, count: 2, near: null }, AbortSignal.timeout(1000)), null);
  const seen: string[] = [];
  const fine = createNamesApi('https://example.test', (url: string): Promise<Response> => {
    seen.push(url);
    return Promise.resolve(new Response(JSON.stringify({ suggestions: [{ name: 'Edda Morrow', mood: 'dawn' }] }), { status: 200 }));
  });
  assert.deepEqual(await fine.suggest({ body: 'woman', count: 2, near: null }, AbortSignal.timeout(1000)), [{ name: 'Edda Morrow', mood: 'dawn' }]);
  assert.deepEqual(seen, ['https://example.test/v1/names/suggest?count=2&body=woman']);
});
