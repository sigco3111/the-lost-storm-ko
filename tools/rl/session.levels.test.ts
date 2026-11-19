import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Fields } from '../../sim/content/read.ts';
import { fields, items } from '../../sim/content/read.ts';
import { ARENA } from '../../sim/rl/arena.ts';
import { levelCount } from '../../sim/rl/curriculum.ts';
import type { Frame } from './frames.ts';
import { frame, FRAME, jsonPart, readJson } from './frames.ts';
import type { Reply, Session } from './session.ts';
import { handle, readDemoRequest } from './session.ts';

function session(): Session {
  return { content: loadContent(), pool: null };
}

function frames(reply: Reply): Frame[] {
  return [...reply.frames].map((out: Buffer): Frame => ({ kind: out.readUInt8(FRAME.word), payload: out.subarray(FRAME.header) }));
}

function request(kind: number, value: unknown): Frame {
  return { kind, payload: frame(kind, jsonPart(value)).subarray(FRAME.header + FRAME.word) };
}

function only(level: number): number[] {
  return Array.from({ length: levelCount() }, (_one: unknown, index: number): number => (index + ARENA.levels.min === level ? 1 : 0));
}

void test('the trainer can change the level weights of a running pool, and bad weights come back as an error', (): void => {
  const open: Session = session();
  handle(open, request(FRAME.hello, { seed: 5, envs: 1, waves: 1, levels: only(4) }));
  const pool = open.pool;
  assert.ok(pool !== null);
  assert.deepEqual(pool.levels, only(4));
  const [ack] = frames(handle(open, request(FRAME.levels, { weights: only(9) })));
  assert.equal(ack?.kind, FRAME.levels);
  assert.deepEqual(pool.levels, only(9));
  const [refused] = frames(handle(open, request(FRAME.levels, { weights: [1] })));
  assert.equal(refused?.kind, FRAME.error);
});

void test('a bot run can name its seeds and leave the samples out', (): void => {
  const asked = readDemoRequest({ seed: 3, seeds: [41, 42], samples: false, waves: 1 });
  assert.equal(asked.episodes, 2);
  assert.deepEqual(asked.seeds, [41, 42]);
  assert.equal(asked.samples, false);
  assert.throws(() => readDemoRequest({ seed: 3, samples: 'no' }), /true or false/);
  const answers: Frame[] = frames(handle(session(), request(FRAME.demo, { seed: 3, seeds: [41], samples: false, waves: 1, levels: only(2) })));
  const first: Frame | undefined = answers[0];
  assert.ok(first !== undefined && first.kind === FRAME.demonstrations);
  assert.equal(first.payload.readUInt32LE(0), 0);
  const info: Fields = fields(readJson(first.payload.subarray(4 * FRAME.word)), 'demo info');
  const episode: Fields = fields(items(info['episodes'], 'episodes')[0], 'episode');
  assert.equal(episode['seed'], 41);
  assert.equal(episode['level'], 2);
});
