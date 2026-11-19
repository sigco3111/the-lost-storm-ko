import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { SpokenClip, VoiceLines } from './voice-lines.ts';
import { createVoiceLines, VOICE_LINES } from './voice-lines.ts';

interface Gate<T> {
  readonly promise: Promise<T>;
  open(value: T): void;
}

function gate<T>(): Gate<T> {
  const waiting: ((value: T) => void)[] = [];
  const promise: Promise<T> = new Promise<T>((resolve: (value: T) => void): void => {
    waiting.push(resolve);
  });
  return {
    promise,
    open(value: T): void {
      for (const resolve of waiting) resolve(value);
    },
  };
}

interface FakeClip extends SpokenClip {
  readonly path: string;
  readonly fades: number[];
  fallQuiet(): void;
  finish(): void;
}

interface Rig {
  readonly lines: VoiceLines;
  readonly asked: string[];
  readonly loaded: string[];
  readonly playing: FakeClip[];
  readonly loads: Map<string, Gate<string | null>>;
  readonly waits: number[];
  readonly limit: Gate<void>;
}

function fakeClip(path: string): FakeClip {
  const quiet: Gate<void> = gate<void>();
  const done: Gate<void> = gate<void>();
  const fades: number[] = [];
  return {
    path,
    fades,
    spoken: quiet.promise,
    ended: done.promise,
    fadeOut(seconds: number): void {
      fades.push(seconds);
      quiet.open();
      done.open();
    },
    fallQuiet(): void {
      quiet.open();
    },
    finish(): void {
      quiet.open();
      done.open();
    },
  };
}

function rig(manifest: Readonly<Record<string, string>>, held: readonly string[] = []): Rig {
  const asked: string[] = [];
  const loaded: string[] = [];
  const playing: FakeClip[] = [];
  const loads: Map<string, Gate<string | null>> = new Map<string, Gate<string | null>>();
  for (const path of held) loads.set(path, gate<string | null>());
  const waits: number[] = [];
  const limit: Gate<void> = gate<void>();
  const lines: VoiceLines = createVoiceLines<string>({
    find: (clipId: string): Promise<string | null> => {
      asked.push(clipId);
      return Promise.resolve(Object.hasOwn(manifest, clipId) ? (manifest[clipId] ?? null) : null);
    },
    load: (path: string): Promise<string | null> => {
      loaded.push(path);
      return loads.get(path)?.promise ?? Promise.resolve(path);
    },
    play: (clip: string): SpokenClip => {
      const spoken: FakeClip = fakeClip(clip);
      playing.push(spoken);
      return spoken;
    },
    wait: (seconds: number): Promise<void> => {
      waits.push(seconds);
      return limit.promise;
    },
  });
  return { lines, asked, loaded, playing, loads, waits, limit };
}

interface Watched {
  done(): boolean;
}

function watched(promise: Promise<void>): Watched {
  let settled: boolean = false;
  void promise.then((): boolean => {
    settled = true;
    return settled;
  });
  return { done: (): boolean => settled };
}

function settle(turns: number = 10): Promise<void> {
  return turns === 0 ? Promise.resolve() : Promise.resolve().then((): Promise<void> => settle(turns - 1));
}

const MANIFEST: Readonly<Record<string, string>> = {
  warden_guide_road: 'voice/warden_guide/warden_guide_road.mp3',
  warden_guide_lesson: 'voice/warden_guide/warden_guide_lesson.mp3',
  warden_trader_goods: 'voice/warden_trader/warden_trader_goods.mp3',
};

void test('a line plays the clip the manifest names for its id, once', async (): Promise<void> => {
  const { lines, asked, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  assert.deepEqual(asked, ['warden_guide_road']);
  assert.deepEqual(playing.map((clip: FakeClip): string => clip.path), ['voice/warden_guide/warden_guide_road.mp3']);
  assert.deepEqual(lines.speaking(), ['warden_guide']);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
});

void test('a line with no clip loads nothing, plays nothing and stays quiet', async (): Promise<void> => {
  const { lines, loaded, playing } = rig(MANIFEST);
  await lines.say('warden_lookout', 'warden_lookout_ahead');
  assert.deepEqual(loaded, []);
  assert.deepEqual(playing, []);
  assert.deepEqual(lines.speaking(), []);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
});

void test('a clip that fails to load plays nothing', async (): Promise<void> => {
  const { lines, loads, playing } = rig(MANIFEST, ['voice/warden_guide/warden_guide_road.mp3']);
  const said: Promise<void> = lines.say('warden_guide', 'warden_guide_road');
  await settle();
  loads.get('voice/warden_guide/warden_guide_road.mp3')?.open(null);
  await said;
  assert.deepEqual(playing, []);
});

void test('a second line from the same speaker fades the first out with the short ease and plays alone', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  void lines.say('warden_guide', 'warden_guide_lesson');
  await settle();
  const first: FakeClip = must(playing[0], 'first line');
  const second: FakeClip = must(playing[1], 'second line');
  assert.deepEqual(first.fades, [VOICE_LINES.fadeSeconds]);
  assert.deepEqual(second.fades, []);
  assert.equal(second.path, 'voice/warden_guide/warden_guide_lesson.mp3');
  assert.deepEqual(lines.speaking(), ['warden_guide']);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
});

void test('lines from different speakers do not cut each other', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  void lines.say('warden_trader', 'warden_trader_goods');
  await settle();
  assert.equal(playing.length, 2);
  assert.deepEqual(playing.map((clip: FakeClip): number => clip.fades.length), [0, 0]);
  assert.deepEqual(lines.speaking(), ['warden_guide', 'warden_trader']);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
});

void test('a line still loading when the speaker moves on never starts', async (): Promise<void> => {
  const { lines, loads, playing } = rig(MANIFEST, ['voice/warden_guide/warden_guide_road.mp3']);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  void lines.say('warden_guide', 'warden_guide_lesson');
  await settle();
  loads.get('voice/warden_guide/warden_guide_road.mp3')?.open('voice/warden_guide/warden_guide_road.mp3');
  await settle();
  assert.deepEqual(playing.map((clip: FakeClip): string => clip.path), ['voice/warden_guide/warden_guide_lesson.mp3']);
});

void test('hush fades every speaker and drops lines still loading', async (): Promise<void> => {
  const { lines, loads, playing } = rig(MANIFEST, ['voice/warden_trader/warden_trader_goods.mp3']);
  void lines.say('warden_guide', 'warden_guide_road');
  void lines.say('warden_trader', 'warden_trader_goods');
  await settle();
  lines.hush();
  loads.get('voice/warden_trader/warden_trader_goods.mp3')?.open('voice/warden_trader/warden_trader_goods.mp3');
  await settle();
  assert.deepEqual(playing.map((clip: FakeClip): string => clip.path), ['voice/warden_guide/warden_guide_road.mp3']);
  assert.deepEqual(playing[0]?.fades, [VOICE_LINES.fadeSeconds]);
  assert.deepEqual(lines.speaking(), []);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
});

void test('a line that ends on its own leaves its speaker quiet', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  const said: Promise<void> = lines.say('warden_guide', 'warden_guide_road');
  await settle();
  playing[0]?.finish();
  await said;
  assert.deepEqual(lines.speaking(), []);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
  assert.deepEqual(playing[0]?.fades, []);
});

void test('a clip that is not ready within the start limit never plays, and its line settles so nothing waits on it forever', async (): Promise<void> => {
  const { lines, loads, playing, waits, limit } = rig(MANIFEST, ['voice/warden_guide/warden_guide_road.mp3']);
  const said: Watched = watched(lines.say('warden_guide', 'warden_guide_road'));
  await settle();
  assert.deepEqual(waits, [VOICE_LINES.startSeconds]);
  assert.equal(said.done(), false);
  limit.open();
  await settle();
  assert.equal(said.done(), true);
  loads.get('voice/warden_guide/warden_guide_road.mp3')?.open('voice/warden_guide/warden_guide_road.mp3');
  await settle();
  assert.deepEqual(playing, []);
});

void test('a clip that started plays to its end however long it is, past the start limit', async (): Promise<void> => {
  const { lines, playing, limit } = rig(MANIFEST);
  const said: Watched = watched(lines.say('warden_guide', 'warden_guide_lesson'));
  await settle();
  limit.open();
  await settle();
  const clip: FakeClip = must(playing[0], 'the line');
  assert.equal(said.done(), false);
  assert.deepEqual(clip.fades, []);
  assert.deepEqual(lines.speaking(), ['warden_guide']);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
  clip.finish();
  await settle();
  assert.equal(said.done(), true);
});

void test('a line is spoken until its last sound, while its silent tail plays on to the end of the file', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  const said: Watched = watched(lines.say('warden_guide', 'warden_guide_road'));
  await settle();
  const clip: FakeClip = must(playing[0], 'the line');
  clip.fallQuiet();
  await settle();
  assert.equal(said.done(), true);
  assert.deepEqual(lines.speaking(), []);
  assert.equal(lines.anySpeaking(), lines.speaking().length > 0);
  assert.deepEqual(clip.fades, []);
});

void test('a skip or a next line from the same speaker still fades a clip in its silent tail', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  must(playing[0], 'first line').fallQuiet();
  await settle();
  void lines.say('warden_guide', 'warden_guide_lesson');
  await settle();
  assert.deepEqual(playing[0]?.fades, [VOICE_LINES.fadeSeconds]);
  must(playing[1], 'second line').fallQuiet();
  await settle();
  lines.hush();
  assert.deepEqual(playing[1]?.fades, [VOICE_LINES.fadeSeconds]);
});

void test('a clip that has played to the end of its file is let go and nothing fades it', async (): Promise<void> => {
  const { lines, playing } = rig(MANIFEST);
  void lines.say('warden_guide', 'warden_guide_road');
  await settle();
  must(playing[0], 'first line').finish();
  await settle();
  lines.hush();
  void lines.say('warden_guide', 'warden_guide_lesson');
  await settle();
  assert.deepEqual(playing[0]?.fades, []);
});

void test('a skip fades the line in a few tens of milliseconds, never a hard stop', (): void => {
  const fade: number = VOICE_LINES.fadeSeconds;
  assert.ok(fade > 0.02 && fade <= 0.08);
});
