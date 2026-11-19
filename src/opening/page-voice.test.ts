import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BookDef, PageDef } from '../../sim/content/story-types.ts';
import type { LineDef } from '../../sim/content/types.ts';
import type { PageVoice } from './page-voice.ts';
import { bookVoiceIds, createPageVoice, pageLine } from './page-voice.ts';

interface Rig {
  readonly voice: PageVoice;
  readonly said: string[];
  busy: boolean;
  soundOn: boolean;
}

const LINE: LineDef = { id: 'diary_look', speaker: 'diary', text: 'Look.' };

function rig(): Rig {
  const said: string[] = [];
  const state: Rig = {
    said,
    busy: false,
    soundOn: true,
    voice: createPageVoice({
      busy: (): boolean => state.busy,
      soundOn: (): boolean => state.soundOn,
      say: (line: LineDef): void => {
        said.push(line.id);
      },
    }),
  };
  return state;
}

function page(id: string, voice: string | null): PageDef {
  return { id, lines: ['Look.'], address: 'For {name}.', unnamed: 'For you.', voice, when: [], sets: {} };
}

void test('the page names its line, and a page without one or with an unknown one names none', (): void => {
  const lines: ReadonlyMap<string, LineDef> = new Map<string, LineDef>([[LINE.id, LINE]]);
  assert.equal(pageLine(lines, [page('first', null), page('second', LINE.id)]), LINE);
  assert.equal(pageLine(lines, [page('first', null)]), null);
  assert.equal(pageLine(lines, [page('first', 'diary_gone')]), null);
  assert.equal(pageLine(lines, []), null);
});

void test('the line is said once, the moment the page opens, and not again while it stays open', (): void => {
  const { voice, said } = rig();
  voice.update();
  assert.deepEqual(said, []);
  voice.opened(LINE);
  assert.deepEqual(said, [LINE.id]);
  voice.update();
  voice.update();
  assert.deepEqual(said, [LINE.id]);
});

void test('each opening says it again', (): void => {
  const { voice, said } = rig();
  voice.opened(LINE);
  voice.closed();
  voice.opened(LINE);
  assert.deepEqual(said, [LINE.id, LINE.id]);
});

void test('while another line is spoken it waits, and says it once that line has ended', (): void => {
  const state: Rig = rig();
  state.busy = true;
  state.voice.opened(LINE);
  state.voice.update();
  assert.deepEqual(state.said, []);
  state.busy = false;
  state.voice.update();
  state.voice.update();
  assert.deepEqual(state.said, [LINE.id]);
});

void test('a page closed before the other line ends says nothing', (): void => {
  const state: Rig = rig();
  state.busy = true;
  state.voice.opened(LINE);
  state.voice.closed();
  state.busy = false;
  state.voice.update();
  assert.deepEqual(state.said, []);
});

void test('with sound off it says nothing, and turning sound on while the page is open does not start it late', (): void => {
  const state: Rig = rig();
  state.soundOn = false;
  state.voice.opened(LINE);
  state.soundOn = true;
  state.voice.update();
  assert.deepEqual(state.said, []);

  const waiting: Rig = rig();
  waiting.busy = true;
  waiting.voice.opened(LINE);
  waiting.soundOn = false;
  waiting.voice.update();
  waiting.soundOn = true;
  waiting.busy = false;
  waiting.voice.update();
  assert.deepEqual(waiting.said, []);
});

void test('a page with no line says nothing', (): void => {
  const { voice, said } = rig();
  voice.opened(null);
  voice.update();
  assert.deepEqual(said, []);
});

void test('the clips to load ahead are every line a book page names, once each, and no unknown line', (): void => {
  const other: LineDef = { id: 'diary_wait', speaker: 'diary', text: 'Wait.' };
  const lines: ReadonlyMap<string, LineDef> = new Map<string, LineDef>([
    [LINE.id, LINE],
    [other.id, other],
  ]);
  const diary: BookDef = { id: 'diary', title: 'A diary', pages: [page('first', LINE.id), page('second', null), page('third', 'diary_gone')] };
  const notes: BookDef = { id: 'notes', title: 'Notes', pages: [page('first', other.id), page('second', LINE.id)] };
  assert.deepEqual(bookVoiceIds([diary, notes], lines), [LINE.id, other.id]);
  assert.deepEqual(bookVoiceIds([], lines), []);
});
