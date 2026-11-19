import { createEcho } from './echo.ts';
import type { EchoChain } from './echo.ts';
import type { SoundCue } from '../../sim/audio.ts';
import type { AmbienceLoop, AmbienceStinger, Score, StingerNear, ZoneAmbience } from '../../sim/content/audio.ts';
import type { AmbienceTracker } from './ambience.ts';
import { createAmbienceTracker, runBatch } from './ambience.ts';
import type { BufferLoader, LoadOptions } from './buffers.ts';
import { createBufferLoader, LOOP_LOAD, PLAY_LOAD, WARM_LOAD } from './buffers.ts';
import type { BufferCache } from './cache.ts';
import { createBufferCache } from './cache.ts';
import type { SoundTicket } from './held.ts';
import { createTicket } from './held.ts';
import type { Fade } from './fade.ts';
import { fadeTo, heldAt } from './fade.ts';
import type { LoadHealth } from './load-health.ts';
import { createLoadHealth } from './load-health.ts';
import { createManifestLoader } from './manifest-loader.ts';
import type { ManifestLoader } from './manifest-loader.ts';
import type { AssetManifest } from './manifest.ts';
import type { Placement } from './mix.ts';
import { CENTRE, MIX } from './mix.ts';
import type { AudioControls, AudioSettings } from './settings.ts';
import type { DueNote } from './score.ts';
import { notesBetween, scoreSounds } from './score.ts';
import type { VariantBag } from './variation.ts';
import { createVariantBag, pitchRate, delayBetween, volumeScale } from './variation.ts';
import type { SpokenClip, VoiceLines } from './voice-lines.ts';
import { createVoiceLines } from './voice-lines.ts';
import type { VoiceHold } from './voice-hold.ts';
import { createVoiceHold } from './voice-hold.ts';
import type { VoiceLimiter } from './voices.ts';
import { createVoiceLimiter } from './voices.ts';
import type { VoiceMeasure } from './loudness.ts';
import { measureVoice, spokenSeconds, voiceGain } from './loudness.ts';
import { warmPaths, warmVoicePaths } from './warm.ts';
import type { IdleQueue } from './idle-queue.ts';
import { createIdleQueue } from './idle-queue.ts';

const SYSTEM = {
  cacheBytes: 64 * 1024 * 1024,
  msPerSecond: 1000,
  bytesPerSample: 4,
  latePlaySeconds: 0.6,
  failedRetrySeconds: 30,
  duckLevel: 0.6,
  duckAttack: 0.06,
  duckRelease: 0.35,
  settingsSmoothing: 0.03,
  ambienceFade: 3,
  muffleOpenHz: 20000,
  muffleClosedHz: 700,
  muffleSmoothing: 0.5,
  stingerPan: 0.6,
  manifestRetrySeconds: 10,
  loopRetrySeconds: 35,
  manifestTimeoutMs: 8000,
  soundTimeoutMs: 20000,
  warmLanes: 2,
  warmFill: 0.75,
  echoSpeaker: 'echo',
  measureIdleMs: 2000,
  scoreLookahead: 2,
  scoreLead: 0.1,
  scoreLate: 0.25,
  bedReleasePad: 0.1,
} as const;

export interface Trigger {
  readonly sound: string;
  readonly time: number;
  readonly volume: number;
  readonly gain: number;
  readonly pan: number;
}

export type StingerLocator = (near: StingerNear) => Placement | null;

export interface AudioSystem {
  readonly controls: AudioControls;
  readonly configured: boolean;
  readonly health: LoadHealth;
  readonly running: boolean;
  unlock(): void;
  play(cue: SoundCue, place: Placement): void;
  playHeld(cue: SoundCue, place: Placement): SoundTicket;
  playVoice(speaker: string, clipId: string): Promise<void>;
  playEcho(audio: ArrayBuffer): Promise<void>;
  warm(ids: readonly string[], voices: readonly string[]): void;
  stopVoice(): void;
  speaking(): readonly string[];
  startAmbience(zone: ZoneAmbience, locate: StingerLocator, fadeIn: number, fadeOut: number): void;
  stopAmbience(fadeOut: number): void;
  update(dt: number): void;
  setMuffled(on: boolean): void;
  onTrigger(listener: (trigger: Trigger) => void): void;
}

export interface AudioOptions {
  readonly base: string | null;
  readonly controls: AudioControls;
  readonly random: () => number;
  readonly clock: () => number;
}

interface Running {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

interface BedNodes {
  readonly generation: number;
  readonly output: GainNode;
  readonly running: Running[];
  fade: Fade;
}

interface ScorePlay {
  readonly score: Score;
  readonly generation: number;
  readonly buffers: Map<string, AudioBuffer>;
  origin: number | null;
  scheduled: number;
}

interface StingerTimer {
  readonly stinger: AmbienceStinger;
  left: number;
}

type Bus = 'effects' | 'ambience';

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly effects: GainNode;
  readonly voice: GainNode;
  readonly ambience: GainNode;
  readonly muffle: BiquadFilterNode;
}

const NOWHERE: StingerLocator = (): Placement | null => null;

function releaseRunning(running: Running): void {
  running.source.disconnect();
  running.gain.disconnect();
}

function applyFade(param: AudioParam, fade: Fade): void {
  param.cancelScheduledValues(fade.start);
  param.setValueAtTime(fade.from, fade.start);
  param.linearRampToValueAtTime(fade.to, fade.end);
}

function fadeHeld(context: AudioContext, source: AudioBufferSourceNode, gain: GainNode, seconds: number): void {
  const now: number = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + seconds);
  try {
    source.stop(now + seconds);
  } catch {
    return;
  }
}

function whenIdle(work: () => void): void {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(work, { timeout: SYSTEM.measureIdleMs });
  else window.setTimeout(work, SYSTEM.measureIdleMs);
}

export function createAudioSystem(options: AudioOptions): AudioSystem {
  const { base, controls, random, clock } = options;
  const limiter: VoiceLimiter = createVoiceLimiter(clock);
  const cache: BufferCache<AudioBuffer> = createBufferCache<AudioBuffer>(SYSTEM.cacheBytes, (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * SYSTEM.bytesPerSample);
  const variants: VariantBag = createVariantBag(random);
  const listeners: ((trigger: Trigger) => void)[] = [];
  const health: LoadHealth = createLoadHealth();
  const hold: VoiceHold = createVoiceHold();
  let bed: BedNodes | null = null;
  let scorePlay: ScorePlay | null = null;
  let timers: StingerTimer[] = [];
  let locateStinger: StingerLocator = NOWHERE;
  const loader: ManifestLoader = createManifestLoader({
    base,
    clock,
    retrySeconds: SYSTEM.manifestRetrySeconds,
    timeoutMs: SYSTEM.manifestTimeoutMs,
    fetchJson: async (url: string, signal: AbortSignal): Promise<unknown> => {
      const response: Response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${response.status}`);
      const data: unknown = await response.json();
      return data;
    },
  });
  let graph: Graph | null = null;
  let muffled: boolean = false;
  let voicesPlaying: number = 0;
  let echoes: number = 0;
  const zoneLoops: AmbienceTracker<AmbienceLoop> = createAmbienceTracker<AmbienceLoop>();
  let loopRetryLeft: number = 0;
  let warmIds: readonly string[] = [];
  let warmVoices: readonly string[] = [];
  let warming: boolean = false;

  const report = (cue: SoundCue, place: Placement): void => {
    const trigger: Trigger = { sound: cue.sound, time: clock(), volume: cue.volume, gain: place.gain, pan: place.pan };
    for (const listener of listeners) listener(trigger);
  };

  const applySettings = (settings: AudioSettings): void => {
    if (graph === null) return;
    const now: number = graph.context.currentTime;
    const ducked: number = voicesPlaying > 0 ? SYSTEM.duckLevel : 1;
    graph.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volumes.master, now, SYSTEM.settingsSmoothing);
    graph.effects.gain.setTargetAtTime(settings.volumes.effects * ducked, now, voicesPlaying > 0 ? SYSTEM.duckAttack : SYSTEM.duckRelease);
    graph.ambience.gain.setTargetAtTime(settings.volumes.ambience * ducked, now, voicesPlaying > 0 ? SYSTEM.duckAttack : SYSTEM.duckRelease);
    graph.voice.gain.setTargetAtTime(settings.volumes.voice, now, SYSTEM.settingsSmoothing);
  };

  controls.subscribe(applySettings);

  const buffers: BufferLoader<AudioBuffer> = createBufferLoader<AudioBuffer>({
    base,
    clock,
    cache,
    failedRetrySeconds: SYSTEM.failedRetrySeconds,
    timeoutMs: SYSTEM.soundTimeoutMs,
    ready: (): boolean => graph !== null,
    fetchBytes: async (url: string, signal: AbortSignal): Promise<ArrayBuffer> => {
      const response: Response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${response.status}`);
      return response.arrayBuffer();
    },
    decode: (bytes: ArrayBuffer): Promise<AudioBuffer> => {
      if (graph === null) return Promise.reject(new Error('no audio graph'));
      return graph.context.decodeAudioData(bytes);
    },
    onOutcome: (ok: boolean): void => health.note(ok),
  });
  const load = (path: string, how: LoadOptions = PLAY_LOAD): Promise<AudioBuffer | null> => buffers.load(path, how);

  const connect = (source: AudioBufferSourceNode, volume: number, pan: number, bus: GainNode, current: Graph, onEnd: () => void): GainNode => {
    const gain: GainNode = current.context.createGain();
    gain.gain.value = volume;
    const panner: StereoPannerNode = current.context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    source.addEventListener('ended', (): void => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      onEnd();
    });
    return gain;
  };

  const playOn = async (bus: Bus, cue: SoundCue, place: Placement, ticket: SoundTicket | null): Promise<void> => {
    const drop = (): void => {
      limiter.end(cue.sound);
      ticket?.finish();
    };
    const current: Graph | null = graph;
    if (current === null) {
      drop();
      return;
    }
    const asked: number = clock();
    if (loader.current() === null) await loader.ready();
    const paths: readonly string[] | undefined = loader.current()?.sfx.get(cue.sound);
    if (paths === undefined) {
      drop();
      return;
    }
    const variant: number = variants.next(cue.sound, paths.length);
    const path: string | undefined = paths[variant];
    const buffer: AudioBuffer | null = path === undefined ? null : await load(path);
    if (buffer === null || clock() - asked > SYSTEM.latePlaySeconds || ticket?.stopped === true) {
      drop();
      return;
    }
    const source: AudioBufferSourceNode = current.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitchRate(random, cue.pitch);
    const level: number = cue.volume * place.gain * volumeScale(random, cue.volumeJitter);
    const gain: GainNode = connect(source, level, place.pan, current[bus], current, drop);
    source.start();
    ticket?.begin((seconds: number): void => fadeHeld(current.context, source, gain, seconds));
  };

  const trigger = (bus: Bus, cue: SoundCue, place: Placement, ticket: SoundTicket | null = null): void => {
    ensureManifest();
    if (!limiter.tryStart(cue.sound, cue.maxVoices, cue.cooldown)) {
      ticket?.finish();
      return;
    }
    report(cue, place);
    playOn(bus, cue, place, ticket).catch((): void => {
      limiter.end(cue.sound);
      ticket?.finish();
    });
  };

  const duck = (delta: number): void => {
    voicesPlaying = Math.max(0, voicesPlaying + delta);
    applySettings(controls.get());
  };

  const startLoop = async (loop: AmbienceLoop, generation: number): Promise<boolean> => {
    await loader.ready();
    const current: Graph | null = graph;
    const manifest: AssetManifest | null = loader.current();
    if (current === null || !zoneLoops.current(generation)) return true;
    if (manifest === null) return false;
    const path: string | undefined = manifest.sfx.get(loop.sound)?.[0];
    if (path === undefined) return true;
    const buffer: AudioBuffer | null = await load(path, LOOP_LOAD);
    const target: BedNodes | null = bed;
    if (!zoneLoops.current(generation) || target === null || target.generation !== generation) return true;
    if (buffer === null) return false;
    const source: AudioBufferSourceNode = current.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain: GainNode = current.context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(loop.volume, current.context.currentTime, SYSTEM.ambienceFade / 3);
    source.connect(gain);
    gain.connect(target.output);
    source.start(0, random() * buffer.duration);
    target.running.push({ source, gain });
    return true;
  };

  const loadScore = async (play: ScorePlay): Promise<void> => {
    await loader.ready();
    const manifest: AssetManifest | null = loader.current();
    if (manifest === null) return;
    await Promise.all(
      scoreSounds(play.score).map(async (sound: string): Promise<void> => {
        const path: string | undefined = manifest.sfx.get(sound)?.[0];
        if (path === undefined) return;
        const buffer: AudioBuffer | null = await load(path, LOOP_LOAD);
        if (buffer !== null) play.buffers.set(sound, buffer);
      }),
    );
    const current: Graph | null = graph;
    if (current === null || scorePlay !== play) return;
    play.origin = current.context.currentTime + SYSTEM.scoreLead;
    play.scheduled = play.origin;
  };

  const playNote = (due: DueNote, play: ScorePlay, target: BedNodes, current: Graph): void => {
    const buffer: AudioBuffer | undefined = play.buffers.get(due.note.sound);
    if (buffer === undefined || due.time < current.context.currentTime - SYSTEM.scoreLate) return;
    const source: AudioBufferSourceNode = current.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = due.note.rate;
    const gain: GainNode = current.context.createGain();
    gain.gain.value = due.note.volume;
    const panner: StereoPannerNode = current.context.createStereoPanner();
    panner.pan.value = due.note.pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(target.output);
    const running: Running = { source, gain };
    target.running.push(running);
    source.addEventListener('ended', (): void => {
      panner.disconnect();
      releaseRunning(running);
      const index: number = target.running.indexOf(running);
      if (index >= 0) target.running.splice(index, 1);
    });
    source.start(Math.max(due.time, current.context.currentTime));
  };

  const scheduleScore = (): void => {
    const play: ScorePlay | null = scorePlay;
    const current: Graph | null = graph;
    const target: BedNodes | null = bed;
    if (play === null || current === null || target === null || play.origin === null || target.generation !== play.generation) return;
    const until: number = current.context.currentTime + SYSTEM.scoreLookahead;
    for (const due of notesBetween(play.score, play.origin, play.scheduled, until)) playNote(due, play, target, current);
    play.scheduled = Math.max(play.scheduled, until);
  };

  const releaseBed = (fadeOut: number): void => {
    const leaving: BedNodes | null = bed;
    bed = null;
    scorePlay = null;
    const current: Graph | null = graph;
    if (leaving === null || current === null) return;
    const now: number = current.context.currentTime;
    leaving.fade = fadeTo(leaving.fade, now, 0, fadeOut);
    applyFade(leaving.output.gain, leaving.fade);
    const end: number = leaving.fade.end + SYSTEM.bedReleasePad;
    for (const running of leaving.running) {
      try {
        running.source.stop(end);
      } catch {
        continue;
      }
    }
    window.setTimeout((): void => {
      for (const running of leaving.running.splice(0, leaving.running.length)) releaseRunning(running);
      leaving.output.disconnect();
    }, (end - now + SYSTEM.bedReleasePad) * SYSTEM.msPerSecond);
  };

  const openBed = (zone: ZoneAmbience, generation: number, fadeIn: number): void => {
    const current: Graph | null = graph;
    if (current === null) return;
    const output: GainNode = current.context.createGain();
    output.connect(current.ambience);
    const fade: Fade = fadeTo(heldAt(0, current.context.currentTime), current.context.currentTime, 1, fadeIn);
    applyFade(output.gain, fade);
    bed = { generation, output, running: [], fade };
    if (zone.score === null) return;
    const play: ScorePlay = { score: zone.score, generation, buffers: new Map<string, AudioBuffer>(), origin: null, scheduled: 0 };
    scorePlay = play;
    loadScore(play).catch((): void => undefined);
  };

  const attemptLoops = (): void => {
    runBatch(zoneLoops, startLoop).catch((): void => undefined);
  };

  const ensureManifest = (): void => {
    if (graph !== null) loader.ensure();
  };

  const measured: WeakMap<AudioBuffer, VoiceMeasure> = new WeakMap<AudioBuffer, VoiceMeasure>();
  const measureOf = (buffer: AudioBuffer): VoiceMeasure => {
    const known: VoiceMeasure | undefined = measured.get(buffer);
    if (known !== undefined) return known;
    const channels: Float32Array[] = Array.from({ length: buffer.numberOfChannels }, (_: unknown, index: number): Float32Array => buffer.getChannelData(index));
    const fresh: VoiceMeasure = measureVoice(channels, buffer.sampleRate);
    measured.set(buffer, fresh);
    return fresh;
  };
  const measureLater: IdleQueue<AudioBuffer> = createIdleQueue<AudioBuffer>(
    (buffer: AudioBuffer): void => {
      measureOf(buffer);
    },
    (buffer: AudioBuffer): boolean => measured.has(buffer),
    whenIdle,
  );

  const startWarm = (): void => {
    const manifest: AssetManifest | null = loader.current();
    if (manifest === null || graph === null || warming) return;
    const voicePaths: readonly string[] = warmVoicePaths(warmVoices, manifest);
    const queue: readonly string[] = [...voicePaths, ...warmPaths(warmIds, manifest)];
    if (queue.length === 0) return;
    warming = true;
    let next: number = 0;
    const lane = (): Promise<void> => {
      if (next >= queue.length || cache.bytes >= SYSTEM.cacheBytes * SYSTEM.warmFill) return Promise.resolve();
      const path: string | undefined = queue[next];
      next += 1;
      if (path === undefined) return lane();
      return load(path, WARM_LOAD).then((buffer: AudioBuffer | null): Promise<void> => {
        if (buffer !== null && voicePaths.includes(path)) measureLater.add(buffer);
        return lane();
      });
    };
    Promise.all(Array.from({ length: SYSTEM.warmLanes }, lane)).catch((): void => undefined);
  };


  const speak = (buffer: AudioBuffer, current: Graph): SpokenClip => {
    const measure: VoiceMeasure = measureOf(buffer);
    const source: AudioBufferSourceNode = current.context.createBufferSource();
    source.buffer = buffer;
    const gain: GainNode = current.context.createGain();
    gain.gain.value = voiceGain(measure);
    source.connect(gain);
    gain.connect(current.voice);
    duck(1);
    let speech: (() => void) | null = null;
    let file: (() => void) | null = null;
    const spoken: Promise<void> = new Promise<void>((resolve: () => void): void => {
      speech = (): void => {
        speech = null;
        duck(-1);
        resolve();
      };
    });
    const ended: Promise<void> = new Promise<void>((resolve: () => void): void => {
      file = resolve;
    });
    const finishSpeech = (): void => {
      if (speech !== null) speech();
    };
    const lastSound: number = window.setTimeout(finishSpeech, spokenSeconds(measure) * SYSTEM.msPerSecond);
    source.addEventListener('ended', (): void => {
      window.clearTimeout(lastSound);
      source.disconnect();
      gain.disconnect();
      finishSpeech();
      if (file !== null) file();
    });
    source.start();
    return {
      spoken,
      ended,
      fadeOut(seconds: number): void {
        const now: number = current.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + seconds);
        try {
          source.stop(now + seconds);
        } catch {
          return;
        }
      },
    };
  };

  const lines: VoiceLines = createVoiceLines<AudioBuffer>({
    find: async (clipId: string): Promise<string | null> => {
      ensureManifest();
      if (graph === null) return null;
      if (loader.current() === null) await loader.ready();
      return loader.current()?.voice.get(clipId) ?? null;
    },
    load: (path: string): Promise<AudioBuffer | null> => (graph === null ? Promise.resolve(null) : load(path)),
    play: (buffer: AudioBuffer): SpokenClip => {
      const current: Graph | null = graph;
      if (current === null) return { spoken: Promise.resolve(), ended: Promise.resolve(), fadeOut: (): void => undefined };
      return speak(buffer, current);
    },
    wait: (seconds: number): Promise<void> =>
      new Promise<void>((resolve: () => void): void => {
        window.setTimeout(resolve, seconds * SYSTEM.msPerSecond);
      }),
  });

  loader.onFailed((): void => health.note(false));
  loader.onLoaded((): void => {
    health.note(true);
    attemptLoops();
    startWarm();
  });

  return {
    controls,
    configured: base !== null,
    health,
    get running(): boolean {
      return base === null || graph?.context.state === 'running';
    },
    unlock(): void {
      if (base === null) return;
      if (graph !== null) {
        if (graph.context.state === 'suspended' && !document.hidden) graph.context.resume().catch((): void => undefined);
        return;
      }
      try {
        const context: AudioContext = new AudioContext();
        const master: GainNode = context.createGain();
        const effects: GainNode = context.createGain();
        const voice: GainNode = context.createGain();
        const ambience: GainNode = context.createGain();
        const muffle: BiquadFilterNode = context.createBiquadFilter();
        muffle.type = 'lowpass';
        muffle.frequency.value = muffled ? SYSTEM.muffleClosedHz : SYSTEM.muffleOpenHz;
        for (const bus of [effects, voice]) bus.connect(master);
        ambience.connect(muffle);
        muffle.connect(master);
        master.connect(context.destination);
        graph = { context, master, effects, voice, ambience, muffle };
        applySettings(controls.get());
        context.resume().catch((): void => undefined);
        document.addEventListener('visibilitychange', (): void => {
          const action: Promise<void> = document.hidden ? context.suspend() : context.resume();
          action.catch((): void => undefined);
        });
        loader.ensure();
      } catch {
        graph = null;
      }
    },
    play(cue: SoundCue, place: Placement): void {
      if (hold.offer(cue, place, clock(), echoes > 0 || lines.anySpeaking())) trigger('effects', cue, place);
    },
    playHeld(cue: SoundCue, place: Placement): SoundTicket {
      const ticket: SoundTicket = createTicket();
      trigger('effects', cue, place, ticket);
      return ticket;
    },
    playVoice(speaker: string, clipId: string): Promise<void> {
      return lines.say(speaker, clipId);
    },
    async playEcho(audio: ArrayBuffer): Promise<void> {
      const current: Graph | null = graph;
      if (current === null) return;
      let buffer: AudioBuffer;
      try {
        buffer = await current.context.decodeAudioData(audio.slice(0));
      } catch {
        return;
      }
      const echo: EchoChain = createEcho(current.context, current.voice);
      const level: GainNode = current.context.createGain();
      level.gain.value = voiceGain(measureOf(buffer));
      level.connect(echo.input);
      const source: AudioBufferSourceNode = current.context.createBufferSource();
      source.buffer = buffer;
      source.connect(level);
      duck(1);
      echoes += 1;
      await new Promise<void>((resolve: () => void): void => {
        source.addEventListener('ended', (): void => {
          window.setTimeout((): void => {
            duck(-1);
            echoes -= 1;
            resolve();
          }, echo.held * SYSTEM.msPerSecond);
          window.setTimeout((): void => {
            source.disconnect();
            level.disconnect();
            echo.release();
          }, echo.tail * SYSTEM.msPerSecond);
        });
        source.start();
      });
    },
    warm(ids: readonly string[], voices: readonly string[]): void {
      warmIds = ids;
      warmVoices = voices;
      startWarm();
    },
    stopVoice(): void {
      lines.hush();
    },
    speaking(): readonly string[] {
      return echoes > 0 ? [...lines.speaking(), SYSTEM.echoSpeaker] : lines.speaking();
    },
    startAmbience(zone: ZoneAmbience, locate: StingerLocator, fadeIn: number, fadeOut: number): void {
      this.stopAmbience(fadeOut);
      locateStinger = locate;
      zoneLoops.start(zone.loops);
      openBed(zone, zoneLoops.generation(), fadeIn);
      loopRetryLeft = SYSTEM.loopRetrySeconds;
      attemptLoops();
      timers = zone.stingers.map((stinger: AmbienceStinger): StingerTimer => ({ stinger, left: delayBetween(stinger.minDelay, stinger.maxDelay, random) }));
    },
    stopAmbience(fadeOut: number): void {
      timers = [];
      zoneLoops.stop();
      releaseBed(fadeOut);
    },
    setMuffled(on: boolean): void {
      if (on === muffled) return;
      muffled = on;
      if (graph === null) return;
      graph.muffle.frequency.setTargetAtTime(on ? SYSTEM.muffleClosedHz : SYSTEM.muffleOpenHz, graph.context.currentTime, SYSTEM.muffleSmoothing);
    },
    update(dt: number): void {
      ensureManifest();
      if (hold.waiting() > 0) {
        for (const held of hold.release(clock(), echoes > 0 || lines.anySpeaking())) trigger('effects', held.cue, held.place);
      }
      scheduleScore();
      loopRetryLeft -= dt;
      if (loopRetryLeft <= 0) {
        loopRetryLeft = SYSTEM.loopRetrySeconds;
        attemptLoops();
      }
      for (const timer of timers) {
        timer.left -= dt;
        if (timer.left > 0) continue;
        timer.left = delayBetween(timer.stinger.minDelay, timer.stinger.maxDelay, random);
        const near: StingerNear | null = timer.stinger.near;
        const place: Placement | null = near === null ? { gain: CENTRE.gain, pan: (random() * 2 - 1) * SYSTEM.stingerPan } : locateStinger(near);
        if (place === null) continue;
        const cue: SoundCue = { sound: timer.stinger.sound, volume: timer.stinger.volume, maxVoices: 1, cooldown: 0, reach: near?.reach ?? MIX.farDistance, holdForVoice: 0, pitch: timer.stinger.pitch, volumeJitter: null, position: null };
        trigger('ambience', cue, place);
      }
    },
    onTrigger(listener: (trigger: Trigger) => void): void {
      listeners.push(listener);
    },
  };
}
