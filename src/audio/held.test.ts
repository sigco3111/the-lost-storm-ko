import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChannelSound, SoundCue } from '../../sim/audio.ts';
import type { CuePlayer, SoundTicket } from './held.ts';
import { createHeldSounds, createTicket, HELD, playChannelled } from './held.ts';

const HERO: number = 1;
const OTHER: number = 7;

function cue(sound: string): SoundCue {
  return { sound, volume: 1, maxVoices: 2, cooldown: 0, reach: 30, holdForVoice: 0, pitch: null, volumeJitter: null, position: null };
}

interface Played {
  readonly plain: string[];
  readonly held: Map<string, SoundTicket>;
  readonly fades: Map<string, number[]>;
}

function recorder(): { readonly played: Played; readonly player: CuePlayer } {
  const played: Played = { plain: [], held: new Map<string, SoundTicket>(), fades: new Map<string, number[]>() };
  const player: CuePlayer = {
    play(sound: SoundCue): void {
      played.plain.push(sound.sound);
    },
    hold(sound: SoundCue): SoundTicket {
      const ticket: SoundTicket = createTicket();
      const fades: number[] = [];
      played.fades.set(sound.sound, fades);
      ticket.begin((seconds: number): void => {
        fades.push(seconds);
      });
      played.held.set(sound.sound, ticket);
      return ticket;
    },
  };
  return { played, player };
}

const HOLD: ChannelSound = { type: 'hold', actorId: HERO };
const RELEASE: ChannelSound = { type: 'release', actorId: HERO };

void test('the sounds a channel starts belong to it and fade out quickly, all of them, when it ends', (): void => {
  const { played, player } = recorder();
  const held = createHeldSounds();
  playChannelled(held, HOLD, [cue('millwheel_whoosh'), cue('water_sweep')], player);
  assert.deepEqual(played.plain, []);
  assert.equal(held.count(HERO), 2);
  playChannelled(held, RELEASE, [], player);
  assert.deepEqual(played.fades.get('millwheel_whoosh'), [HELD.fadeSeconds]);
  assert.deepEqual(played.fades.get('water_sweep'), [HELD.fadeSeconds]);
  assert.equal(held.count(HERO), 0);
});

void test('a sound that is not a channel\'s plays to its end and nothing stops it', (): void => {
  const { played, player } = recorder();
  const held = createHeldSounds();
  playChannelled(held, null, [cue('sword_swing_light')], player);
  playChannelled(held, RELEASE, [], player);
  assert.deepEqual(played.plain, ['sword_swing_light']);
  assert.equal(played.fades.size, 0);
});

void test('a channel ending stops only its own actor\'s sounds, and only once', (): void => {
  const { played, player } = recorder();
  const held = createHeldSounds();
  playChannelled(held, HOLD, [cue('millwheel_whoosh')], player);
  playChannelled(held, { type: 'hold', actorId: OTHER }, [cue('electric_crackle')], player);
  playChannelled(held, RELEASE, [], player);
  playChannelled(held, RELEASE, [], player);
  assert.deepEqual(played.fades.get('millwheel_whoosh'), [HELD.fadeSeconds]);
  assert.deepEqual(played.fades.get('electric_crackle'), []);
  assert.equal(held.count(OTHER), 1);
  held.releaseAll();
  assert.deepEqual(played.fades.get('electric_crackle'), [HELD.fadeSeconds]);
});

void test('a channel that ends while its sound is still loading never lets that sound start', (): void => {
  const ticket: SoundTicket = createTicket();
  const held = createHeldSounds();
  held.hold(HERO, ticket);
  held.release(HERO);
  assert.equal(ticket.stopped, true);
  const fades: number[] = [];
  ticket.begin((seconds: number): void => {
    fades.push(seconds);
  });
  ticket.stop(HELD.fadeSeconds);
  assert.deepEqual(fades, []);
});

void test('a sound that already played out is let go without a stop, and a finished one is not held again', (): void => {
  const fades: number[] = [];
  const ticket: SoundTicket = createTicket();
  ticket.begin((seconds: number): void => {
    fades.push(seconds);
  });
  ticket.finish();
  assert.equal(ticket.over, true);
  assert.equal(ticket.stopped, false);
  const held = createHeldSounds();
  held.hold(HERO, ticket);
  assert.equal(held.count(HERO), 0);
  held.release(HERO);
  assert.deepEqual(fades, []);
});

void test('a player that cannot place a held sound leaves nothing to stop', (): void => {
  const held = createHeldSounds();
  const silent: CuePlayer = { play: (): void => undefined, hold: (): SoundTicket | null => null };
  playChannelled(held, HOLD, [cue('millwheel_whoosh')], silent);
  assert.equal(held.count(HERO), 0);
});
