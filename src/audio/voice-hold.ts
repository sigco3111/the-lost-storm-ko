import type { SoundCue } from '../../sim/audio.ts';
import type { Placement } from './mix.ts';

export interface HeldCue {
  readonly cue: SoundCue;
  readonly place: Placement;
}

interface Waiting extends HeldCue {
  readonly until: number;
}

export interface VoiceHold {
  offer(cue: SoundCue, place: Placement, now: number, speaking: boolean): boolean;
  release(now: number, speaking: boolean): readonly HeldCue[];
  waiting(): number;
}

const NONE_HELD: readonly HeldCue[] = [];

export function createVoiceHold(): VoiceHold {
  let held: Waiting[] = [];
  return {
    offer(cue: SoundCue, place: Placement, now: number, speaking: boolean): boolean {
      if (cue.holdForVoice <= 0 || !speaking) return true;
      if (held.some((entry: Waiting): boolean => entry.cue.sound === cue.sound)) return false;
      held.push({ cue, place, until: now + cue.holdForVoice });
      return false;
    },
    release(now: number, speaking: boolean): readonly HeldCue[] {
      if (held.length === 0) return NONE_HELD;
      held = held.filter((entry: Waiting): boolean => now <= entry.until);
      if (speaking || held.length === 0) return NONE_HELD;
      const ready: readonly HeldCue[] = held.map((entry: Waiting): HeldCue => ({ cue: entry.cue, place: entry.place }));
      held = [];
      return ready;
    },
    waiting(): number {
      return held.length;
    },
  };
}
