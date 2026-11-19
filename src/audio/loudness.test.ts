import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VoiceMeasure } from './loudness.ts';
import { integratedLoudness, LOUDNESS, measureVoice, spokenSeconds, VOICE_LEVEL, voiceGain } from './loudness.ts';

const RATE: number = 48000;
const TONE_HZ: number = 997;

function tone(seconds: number, amplitude: number, rate: number = RATE): Float32Array {
  const samples: Float32Array = new Float32Array(Math.round(seconds * rate));
  for (let index: number = 0; index < samples.length; index += 1) samples[index] = amplitude * Math.sin((2 * Math.PI * TONE_HZ * index) / rate);
  return samples;
}

function joined(...parts: readonly Float32Array[]): Float32Array {
  const total: number = parts.reduce((sum: number, part: Float32Array): number => sum + part.length, 0);
  const out: Float32Array = new Float32Array(total);
  let at: number = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function decibels(gain: number): number {
  return 20 * Math.log10(gain);
}

void test('a full-scale 997 Hz tone reads -3.01 LUFS on one channel, at 48 and 44.1 kHz', (): void => {
  assert.ok(Math.abs(integratedLoudness([tone(2, 1)], RATE) - -3.01) < 0.05);
  assert.ok(Math.abs(integratedLoudness([tone(2, 1, 44100)], 44100) - -3.01) < 0.05);
});

void test('the tone 20 dB down reads 20 LU lower, and silence reads as no loudness at all', (): void => {
  assert.ok(Math.abs(integratedLoudness([tone(2, 0.1)], RATE) - -23.01) < 0.05);
  assert.equal(integratedLoudness([new Float32Array(RATE)], RATE), -Infinity);
});

void test('the pauses between words do not lower the loudness of a line', (): void => {
  const spoken: number = integratedLoudness([tone(2, 0.1)], RATE);
  const paused: number = integratedLoudness([joined(tone(1, 0.1), new Float32Array(RATE * 2), tone(1, 0.1))], RATE);
  const ungated: number = spoken - 10 * Math.log10(2);
  assert.ok(paused > spoken - 1);
  assert.ok(paused > ungated + 2);
});

void test('a clip shorter than one block is measured whole', (): void => {
  assert.ok(Math.abs(integratedLoudness([tone(0.25, 0.1)], RATE) - -23.01) < 0.2);
});

void test('every clip is brought to the one voice target, a quiet one up and a loud one down', (): void => {
  const loud: VoiceMeasure = measureVoice([tone(2, 0.5)], RATE);
  const quiet: VoiceMeasure = measureVoice([tone(2, 0.08)], RATE);
  assert.ok(Math.abs(loud.loudness + decibels(voiceGain(loud)) - VOICE_LEVEL.targetLufs) < 0.05);
  assert.ok(Math.abs(quiet.loudness + decibels(voiceGain(quiet)) - VOICE_LEVEL.targetLufs) < 0.05);
  assert.ok(voiceGain(loud) < 1);
  assert.ok(voiceGain(quiet) > 1);
});

void test('a raise never pushes a peak past the ceiling and never exceeds the largest boost', (): void => {
  const whisper: VoiceMeasure = { loudness: -40, peak: 0.1, seconds: 2, voicedSeconds: 2 };
  assert.ok(Math.abs(decibels(voiceGain(whisper)) - VOICE_LEVEL.mostBoostDb) < 1e-9);
  const spiky: VoiceMeasure = { loudness: -30, peak: 0.8, seconds: 2, voicedSeconds: 2 };
  assert.ok(Math.abs(decibels(0.8 * voiceGain(spiky)) - VOICE_LEVEL.ceilingDb) < 1e-9);
  assert.equal(voiceGain({ loudness: -Infinity, peak: 0, seconds: 1, voicedSeconds: 0 }), 1);
});

void test('a line is spoken until its last audible sound and a short settle, never past the end of its clip', (): void => {
  const measure: VoiceMeasure = measureVoice([joined(tone(1.5, 0.3), new Float32Array(RATE * 2))], RATE);
  assert.ok(Math.abs(measure.voicedSeconds - 1.5) < 0.01);
  assert.ok(Math.abs(measure.seconds - 3.5) < 1e-9);
  assert.ok(Math.abs(spokenSeconds(measure) - (1.5 + VOICE_LEVEL.settleSeconds)) < 0.01);
  const full: VoiceMeasure = measureVoice([tone(1, 0.3)], RATE);
  assert.equal(spokenSeconds(full), full.seconds);
});

interface ReferenceStage {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

function referenceStages(rate: number): readonly ReferenceStage[] {
  const k: number = Math.tan((Math.PI * LOUDNESS.shelfHz) / rate);
  const vh: number = 10 ** (LOUDNESS.shelfGainDb / 20);
  const vb: number = vh ** LOUDNESS.shelfBlend;
  const a0: number = 1 + k / LOUDNESS.shelfQ + k * k;
  const p: number = Math.tan((Math.PI * LOUDNESS.passHz) / rate);
  const p0: number = 1 + p / LOUDNESS.passQ + p * p;
  return [
    { b0: (vh + (vb * k) / LOUDNESS.shelfQ + k * k) / a0, b1: (2 * (k * k - vh)) / a0, b2: (vh - (vb * k) / LOUDNESS.shelfQ + k * k) / a0, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / LOUDNESS.shelfQ + k * k) / a0 },
    { b0: 1, b1: -2, b2: 1, a1: (2 * (p * p - 1)) / p0, a2: (1 - p / LOUDNESS.passQ + p * p) / p0 },
  ];
}

function referenceFiltered(samples: Float32Array, stages: readonly ReferenceStage[]): Float64Array {
  let input: Float64Array = Float64Array.from(samples);
  for (const stage of stages) {
    const output: Float64Array = new Float64Array(input.length);
    let x1: number = 0;
    let x2: number = 0;
    let y1: number = 0;
    let y2: number = 0;
    for (let index: number = 0; index < input.length; index += 1) {
      const x: number = input[index] ?? 0;
      const y: number = stage.b0 * x + stage.b1 * x1 + stage.b2 * x2 - stage.a1 * y1 - stage.a2 * y2;
      output[index] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
    input = output;
  }
  return input;
}

function level(power: number): number {
  return power > 0 ? LOUDNESS.offset + 10 * Math.log10(power) : -Infinity;
}

function average(values: readonly number[]): number {
  return values.reduce((sum: number, value: number): number => sum + value, 0) / values.length;
}

function referenceLoudness(channels: readonly Float32Array[], rate: number): number {
  const stages: readonly ReferenceStage[] = referenceStages(rate);
  const weighted: Float64Array[] = channels.map((channel: Float32Array): Float64Array => referenceFiltered(channel, stages));
  const length: number = weighted[0]?.length ?? 0;
  const block: number = Math.min(length, Math.round(LOUDNESS.blockSeconds * rate));
  const step: number = Math.max(1, Math.round(LOUDNESS.stepSeconds * rate));
  const powers: number[] = [];
  if (block > 0) {
    for (let start: number = 0; start + block <= length; start += step) {
      let power: number = 0;
      for (const channel of weighted) {
        let sum: number = 0;
        for (let index: number = start; index < start + block; index += 1) sum += (channel[index] ?? 0) ** 2;
        power += sum / block;
      }
      powers.push(power);
    }
  }
  const loud: number[] = powers.filter((power: number): boolean => level(power) > LOUDNESS.absoluteGate);
  if (loud.length === 0) return -Infinity;
  const gate: number = level(average(loud)) + LOUDNESS.relativeGate;
  return level(average(loud.filter((power: number): boolean => level(power) > gate)));
}

function noise(seconds: number, amplitude: number, seed: number, rate: number): Float32Array {
  const samples: Float32Array = new Float32Array(Math.round(seconds * rate));
  let state: number = seed;
  for (let index: number = 0; index < samples.length; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    samples[index] = amplitude * ((state / 2147483648) * 2 - 1) * Math.sin(index / 900);
  }
  return samples;
}

void test('the loudness of any clip is the same number, to the last bit, as the two-pass filter it replaced', (): void => {
  const cases: readonly (readonly [readonly Float32Array[], number])[] = [
    [[noise(3.3, 0.4, 7, RATE)], RATE],
    [[noise(2.1, 0.7, 11, RATE), noise(2.1, 0.2, 13, RATE)], RATE],
    [[noise(1.7, 0.05, 17, 44100)], 44100],
    [[noise(0.3, 0.6, 19, 22050), noise(0.3, 0.6, 23, 22050)], 22050],
    [[joined(tone(0.8, 0.3), new Float32Array(RATE), noise(0.9, 0.5, 29, RATE))], RATE],
    [[new Float32Array(RATE)], RATE],
    [[new Float32Array(0)], RATE],
  ];
  for (const [channels, rate] of cases) assert.ok(Object.is(integratedLoudness(channels, rate), referenceLoudness(channels, rate)));
});
