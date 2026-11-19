export const LOUDNESS = {
  blockSeconds: 0.4,
  stepSeconds: 0.1,
  absoluteGate: -70,
  relativeGate: -10,
  offset: -0.691,
  shelfHz: 1681.974450955533,
  shelfGainDb: 3.999843853973347,
  shelfQ: 0.7071752369554196,
  shelfBlend: 0.4996667741545416,
  passHz: 38.13547087602444,
  passQ: 0.5003270373238773,
  voicedFloorDb: -45,
} as const;

export const VOICE_LEVEL = {
  targetLufs: -22,
  ceilingDb: -1,
  mostBoostDb: 6,
  settleSeconds: 0.25,
} as const;

export interface VoiceMeasure {
  readonly loudness: number;
  readonly peak: number;
  readonly seconds: number;
  readonly voicedSeconds: number;
}

interface Biquad {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

function shelf(rate: number): Biquad {
  const k: number = Math.tan((Math.PI * LOUDNESS.shelfHz) / rate);
  const vh: number = 10 ** (LOUDNESS.shelfGainDb / 20);
  const vb: number = vh ** LOUDNESS.shelfBlend;
  const a0: number = 1 + k / LOUDNESS.shelfQ + k * k;
  return {
    b0: (vh + (vb * k) / LOUDNESS.shelfQ + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / LOUDNESS.shelfQ + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / LOUDNESS.shelfQ + k * k) / a0,
  };
}

function highPass(rate: number): Biquad {
  const k: number = Math.tan((Math.PI * LOUDNESS.passHz) / rate);
  const a0: number = 1 + k / LOUDNESS.passQ + k * k;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / LOUDNESS.passQ + k * k) / a0 };
}

function weightedSquares(samples: Float32Array, first: Biquad, second: Biquad): Float64Array {
  const squares: Float64Array = new Float64Array(samples.length);
  let x1: number = 0;
  let x2: number = 0;
  let y1: number = 0;
  let y2: number = 0;
  let z1: number = 0;
  let z2: number = 0;
  for (let index: number = 0; index < samples.length; index += 1) {
    const x: number = samples[index] ?? 0;
    const y: number = first.b0 * x + first.b1 * x1 + first.b2 * x2 - first.a1 * y1 - first.a2 * y2;
    const z: number = second.b0 * y + second.b1 * y1 + second.b2 * y2 - second.a1 * z1 - second.a2 * z2;
    squares[index] = z ** 2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    z2 = z1;
    z1 = z;
  }
  return squares;
}

function blockPowers(squared: readonly Float64Array[], rate: number): number[] {
  const length: number = squared[0]?.length ?? 0;
  const block: number = Math.min(length, Math.round(LOUDNESS.blockSeconds * rate));
  const step: number = Math.max(1, Math.round(LOUDNESS.stepSeconds * rate));
  const powers: number[] = [];
  if (block === 0) return powers;
  for (let start: number = 0; start + block <= length; start += step) {
    let power: number = 0;
    for (const channel of squared) {
      let sum: number = 0;
      for (let index: number = start; index < start + block; index += 1) sum += channel[index] ?? 0;
      power += sum / block;
    }
    powers.push(power);
  }
  return powers;
}

function loudnessOf(power: number): number {
  return power > 0 ? LOUDNESS.offset + 10 * Math.log10(power) : -Infinity;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum: number, value: number): number => sum + value, 0) / values.length;
}

export function integratedLoudness(channels: readonly Float32Array[], rate: number): number {
  const first: Biquad = shelf(rate);
  const second: Biquad = highPass(rate);
  const powers: number[] = blockPowers(channels.map((channel: Float32Array): Float64Array => weightedSquares(channel, first, second)), rate);
  const loud: number[] = powers.filter((power: number): boolean => loudnessOf(power) > LOUDNESS.absoluteGate);
  if (loud.length === 0) return -Infinity;
  const gate: number = loudnessOf(mean(loud)) + LOUDNESS.relativeGate;
  const kept: number[] = loud.filter((power: number): boolean => loudnessOf(power) > gate);
  return loudnessOf(mean(kept));
}

export function measureVoice(channels: readonly Float32Array[], rate: number): VoiceMeasure {
  const floor: number = 10 ** (LOUDNESS.voicedFloorDb / 20);
  let peak: number = 0;
  let last: number = -1;
  for (const channel of channels) {
    for (let index: number = 0; index < channel.length; index += 1) {
      const level: number = Math.abs(channel[index] ?? 0);
      if (level > peak) peak = level;
      if (level >= floor && index > last) last = index;
    }
  }
  const length: number = channels[0]?.length ?? 0;
  return { loudness: integratedLoudness(channels, rate), peak, seconds: length / rate, voicedSeconds: (last + 1) / rate };
}

export function voiceGain(measure: VoiceMeasure): number {
  if (!Number.isFinite(measure.loudness) || measure.peak <= 0) return 1;
  const wanted: number = VOICE_LEVEL.targetLufs - measure.loudness;
  const headroom: number = VOICE_LEVEL.ceilingDb - 20 * Math.log10(measure.peak);
  return 10 ** (Math.min(wanted, headroom, VOICE_LEVEL.mostBoostDb) / 20);
}

export function spokenSeconds(measure: VoiceMeasure): number {
  return Math.min(measure.seconds, measure.voicedSeconds + VOICE_LEVEL.settleSeconds);
}
