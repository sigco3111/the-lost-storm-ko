import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { ZoneAmbience } from '../../sim/content/audio.ts';
import { loadAudio } from '../../sim/content/audio.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Bed, BedChange, BedPlayer, Beds } from './beds.ts';
import { BEDS, createBeds, LOBBY_BED, playBedChange } from './beds.ts';
import type { Placement } from './mix.ts';
import type { StingerLocator } from './system.ts';

const CAVE: Bed = { kind: 'zone', zone: 'under_hall' };
const HALL: Bed = { kind: 'zone', zone: 'hall_of_time' };
const NOWHERE: StingerLocator = (): Placement | null => null;
const STEP: number = 0.05;

interface FakeClock {
  now: number;
}

function setUp(): { readonly clock: FakeClock; readonly beds: Beds } {
  const clock: FakeClock = { now: 0 };
  return { clock, beds: createBeds((): number => clock.now) };
}

function largestStep(clock: FakeClock, beds: Beds, key: string, seconds: number): number {
  let largest: number = 0;
  let last: number = beds.level(key);
  for (let passed: number = 0; passed < seconds; passed += STEP) {
    clock.now += STEP;
    const level: number = beds.level(key);
    largest = Math.max(largest, Math.abs(level - last));
    last = level;
  }
  return largest;
}

void test('before any input the lobby is only wanted; the first input starts it from silence over four seconds', (): void => {
  const { clock, beds } = setUp();
  assert.equal(beds.want(LOBBY_BED), null);
  assert.equal(beds.playing, null);
  clock.now = 7;
  const change: BedChange = must(beds.unlock(), 'the lobby starting on the first input');
  assert.equal(change.leaving, null);
  assert.equal(must(change.entering, 'the lobby').key, BEDS.lobbyKey);
  assert.equal(beds.level(BEDS.lobbyKey), 0);
  clock.now = 9;
  assert.equal(beds.level(BEDS.lobbyKey), 0.5);
  clock.now = 7 + BEDS.lobbyIn;
  assert.equal(beds.level(BEDS.lobbyKey), 1);
  assert.equal(beds.unlock(), null);
});

void test('the title alone stays silent: unlocking with nothing wanted starts nothing', (): void => {
  const { beds } = setUp();
  assert.equal(beds.unlock(), null);
  assert.equal(beds.playing, null);
});

void test('Continue crossfades the lobby into the zone, and neither level jumps from one frame to the next', (): void => {
  const { clock, beds } = setUp();
  beds.unlock();
  beds.want(LOBBY_BED);
  clock.now = 10;
  const change: BedChange = must(beds.want(CAVE), 'the crossfade into play');
  assert.equal(must(change.leaving, 'the lobby leaving').key, BEDS.lobbyKey);
  assert.equal(must(change.entering, 'the zone entering').key, `${BEDS.zonePrefix}under_hall`);
  const steps: number[] = [];
  let lastLobby: number = beds.level(BEDS.lobbyKey);
  let lastZone: number = beds.level('zone:under_hall');
  assert.equal(lastLobby, 1);
  assert.equal(lastZone, 0);
  for (let passed: number = 0; passed < BEDS.lobbyOut + 1; passed += STEP) {
    clock.now += STEP;
    const lobby: number = beds.level(BEDS.lobbyKey);
    const zone: number = beds.level('zone:under_hall');
    steps.push(Math.abs(lobby - lastLobby), Math.abs(zone - lastZone));
    lastLobby = lobby;
    lastZone = zone;
  }
  assert.ok(Math.max(...steps) <= STEP / Math.min(BEDS.lobbyOut, BEDS.zoneIn) + 1e-9);
  assert.equal(lastLobby, 0);
  assert.equal(lastZone, 1);
});

void test('Back to title keeps the lobby bed playing, and opening the lobby again does not restart it', (): void => {
  const { beds } = setUp();
  beds.unlock();
  assert.notEqual(beds.want(LOBBY_BED), null);
  assert.equal(beds.want(LOBBY_BED), null);
  assert.equal(beds.playing, BEDS.lobbyKey);
});

void test('leaving play fades the zone out to silence, and the lobby fades in when its veil lifts', (): void => {
  const { clock, beds } = setUp();
  beds.unlock();
  beds.want(HALL);
  clock.now = 20;
  const out: BedChange = must(beds.want(null), 'the zone fading out');
  assert.equal(out.entering, null);
  assert.equal(must(out.leaving, 'the zone').fade.end - 20, BEDS.zoneOut);
  assert.ok(largestStep(clock, beds, 'zone:hall_of_time', BEDS.zoneOut + 1) <= STEP / BEDS.zoneOut + 1e-9);
  assert.equal(beds.level('zone:hall_of_time'), 0);
  const back: BedChange = must(beds.want(LOBBY_BED), 'the lobby coming back');
  assert.equal(back.leaving, null);
  assert.equal(must(back.entering, 'the lobby').fade.from, 0);
});

void test('a change made halfway through a fade-in leaves from the level it had reached, never from full', (): void => {
  const { clock, beds } = setUp();
  beds.unlock();
  beds.want(LOBBY_BED);
  clock.now = BEDS.lobbyIn / 4;
  const change: BedChange = must(beds.want(CAVE), 'an early Continue');
  assert.equal(must(change.leaving, 'the lobby').fade.from, 0.25);
});

void test('a hush is quick, and the zone starts again after it; the same zone asked twice does nothing', (): void => {
  const { clock, beds } = setUp();
  beds.unlock();
  beds.want(CAVE);
  assert.equal(beds.want(CAVE), null);
  clock.now = 5;
  const hushed: BedChange = must(beds.hush(), 'the hush');
  assert.ok(Math.abs(must(hushed.leaving, 'the zone').fade.end - 5 - BEDS.hush) < 1e-9);
  assert.equal(beds.playing, null);
  assert.notEqual(beds.want(CAVE), null);
  const moved: BedChange = must(beds.want(HALL), 'a zone change');
  assert.equal(must(moved.leaving, 'the cave').key, 'zone:under_hall');
  assert.equal(must(moved.entering, 'the hall').key, 'zone:hall_of_time');
});

interface Call {
  readonly kind: 'start' | 'stop';
  readonly zone: ZoneAmbience | null;
  readonly fadeIn: number;
  readonly fadeOut: number;
}

function recorder(calls: Call[]): BedPlayer {
  return {
    startAmbience(zone: ZoneAmbience, _locate: StingerLocator, fadeIn: number, fadeOut: number): void {
      calls.push({ kind: 'start', zone, fadeIn, fadeOut });
    },
    stopAmbience(fadeOut: number): void {
      calls.push({ kind: 'stop', zone: null, fadeIn: 0, fadeOut });
    },
  };
}

void test('the lobby plays its own bed from the audio data, with its score, and hands over to the zone with fades on both sides', (): void => {
  const audio = loadAudio(loadContent());
  const ambienceOf = (bed: Bed): ZoneAmbience | undefined => (bed.kind === 'lobby' ? audio.lobby : audio.ambience.get(bed.zone));
  const { beds } = setUp();
  const calls: Call[] = [];
  const player: BedPlayer = recorder(calls);
  beds.want(LOBBY_BED);
  playBedChange(player, beds.unlock(), ambienceOf, NOWHERE);
  playBedChange(player, beds.want(CAVE), ambienceOf, NOWHERE);
  playBedChange(player, beds.want({ kind: 'zone', zone: 'a_zone_with_no_bed' }), ambienceOf, NOWHERE);
  playBedChange(player, beds.want(LOBBY_BED), ambienceOf, NOWHERE);
  assert.deepEqual(
    calls.map((call: Call): string => `${call.kind} in ${call.fadeIn} out ${call.fadeOut}`),
    [`start in ${BEDS.lobbyIn} out 0`, `start in ${BEDS.zoneIn} out ${BEDS.lobbyOut}`, `stop in 0 out ${BEDS.zoneOut}`, `start in ${BEDS.lobbyIn} out ${BEDS.zoneOut}`],
  );
  assert.equal(calls[0]?.zone, audio.lobby);
  assert.equal(calls[1]?.zone, audio.ambience.get('under_hall'));
  assert.notEqual(audio.lobby.score, null);
});
