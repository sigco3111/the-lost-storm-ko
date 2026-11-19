import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Frame } from './frames.ts';
import { createReader, frame, FRAME, jsonPart, observationFrame, readActions, readFrames, readJson } from './frames.ts';

void test('frames split across chunks come out whole and in order', (): void => {
  const first: Buffer = frame(FRAME.hello, jsonPart({ envs: 2 }));
  const second: Buffer = frame(FRAME.reset, []);
  const joined: Buffer = Buffer.concat([first, second]);
  const reader = createReader();
  const cut: number = 7;
  const frames: Frame[] = [...readFrames(reader, joined.subarray(0, cut)), ...readFrames(reader, joined.subarray(cut))];
  assert.deepEqual(frames.map((each: Frame): number => each.kind), [FRAME.hello, FRAME.reset]);
  assert.deepEqual(readJson(frames[0]?.payload.subarray(FRAME.word) ?? Buffer.alloc(0)), { envs: 2 });
  assert.equal(frames[1]?.payload.length, 0);
});

void test('actions read back from little-endian words at any offset', (): void => {
  const words: Buffer = Buffer.alloc(13);
  [3, 0, 7].forEach((value: number, index: number): void => void words.writeInt32LE(value, 1 + index * FRAME.word));
  assert.deepEqual([...readActions(words.subarray(1))], [3, 0, 7]);
});

void test('an observation frame lays its arrays out in the documented order', (): void => {
  const built: Buffer = observationFrame({ envs: 1, size: 2, maskSize: 3, obs: new Float32Array([1.5, -2]), rewards: new Float32Array([0.25]), mask: new Uint8Array([1, 0, 1]), dones: new Uint8Array([1]), info: { finished: [] } });
  const payload: Buffer = built.subarray(FRAME.header);
  assert.equal(built.readUInt8(FRAME.word), FRAME.observations);
  assert.deepEqual([payload.readUInt32LE(0), payload.readUInt32LE(4), payload.readUInt32LE(8)], [1, 2, 3]);
  assert.deepEqual([payload.readFloatLE(12), payload.readFloatLE(16), payload.readFloatLE(20)], [1.5, -2, 0.25]);
  assert.deepEqual([...payload.subarray(24, 28)], [1, 0, 1, 1]);
  assert.deepEqual(readJson(payload.subarray(32)), { finished: [] });
});
