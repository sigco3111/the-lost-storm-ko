export const FRAME = {
  header: 5,
  word: 4,
  hello: 104,
  reset: 114,
  step: 115,
  demo: 100,
  tag: 116,
  levels: 108,
  quit: 113,
  observations: 111,
  demonstrations: 68,
  error: 101,
} as const;

export interface Frame {
  readonly kind: number;
  readonly payload: Buffer;
}

export interface FrameReader {
  pending: Buffer;
}

export function createReader(): FrameReader {
  return { pending: Buffer.alloc(0) };
}

export function readFrames(reader: FrameReader, chunk: Buffer): Frame[] {
  reader.pending = reader.pending.length === 0 ? chunk : Buffer.concat([reader.pending, chunk]);
  const frames: Frame[] = [];
  while (reader.pending.length >= FRAME.header) {
    const length: number = reader.pending.readUInt32LE(0);
    if (reader.pending.length < FRAME.header + length) break;
    frames.push({ kind: reader.pending.readUInt8(FRAME.word), payload: reader.pending.subarray(FRAME.header, FRAME.header + length) });
    reader.pending = reader.pending.subarray(FRAME.header + length);
  }
  return frames;
}

export function frame(kind: number, parts: readonly ArrayBufferView[]): Buffer {
  const length: number = parts.reduce((sum: number, part: ArrayBufferView): number => sum + part.byteLength, 0);
  const head: Buffer = Buffer.alloc(FRAME.header);
  head.writeUInt32LE(length, 0);
  head.writeUInt8(kind, FRAME.word);
  return Buffer.concat([head, ...parts.map((part: ArrayBufferView): Buffer => Buffer.from(part.buffer, part.byteOffset, part.byteLength))]);
}

export function words(...values: readonly number[]): Uint8Array {
  const out: Buffer = Buffer.alloc(values.length * FRAME.word);
  values.forEach((value: number, index: number): void => void out.writeUInt32LE(value, index * FRAME.word));
  return out;
}

export function jsonPart(value: unknown): readonly Uint8Array[] {
  const body: Buffer = Buffer.from(JSON.stringify(value), 'utf8');
  return [words(body.length), body];
}

export interface ObservationBlock {
  readonly envs: number;
  readonly size: number;
  readonly maskSize: number;
  readonly obs: Float32Array;
  readonly rewards: Float32Array;
  readonly mask: Uint8Array;
  readonly dones: Uint8Array;
  readonly info: unknown;
}

export function observationFrame(block: ObservationBlock): Buffer {
  return frame(FRAME.observations, [words(block.envs, block.size, block.maskSize), block.obs, block.rewards, block.mask, block.dones, ...jsonPart(block.info)]);
}

export interface DemonstrationBlock {
  readonly count: number;
  readonly size: number;
  readonly maskSize: number;
  readonly obs: Float32Array;
  readonly actions: Int32Array;
  readonly mask: Uint8Array;
  readonly info: unknown;
}

export function demonstrationFrame(block: DemonstrationBlock): Buffer {
  return frame(FRAME.demonstrations, [words(block.count, block.size, block.maskSize), block.obs, block.actions, block.mask, ...jsonPart(block.info)]);
}

export function readJson(payload: Buffer): unknown {
  return payload.length === 0 ? null : JSON.parse(payload.toString('utf8'));
}

export function readActions(payload: Buffer): Int32Array {
  const out: Int32Array = new Int32Array(Math.floor(payload.length / FRAME.word));
  for (let index: number = 0; index < out.length; index += 1) out[index] = payload.readInt32LE(index * FRAME.word);
  return out;
}
