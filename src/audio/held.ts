import type { ChannelSound, SoundCue } from '../../sim/audio.ts';

export const HELD = {
  fadeSeconds: 0.04,
} as const;

export type TicketStop = (seconds: number) => void;

export interface SoundTicket {
  readonly stopped: boolean;
  readonly over: boolean;
  begin(stop: TicketStop): void;
  finish(): void;
  stop(seconds: number): void;
}

type TicketState = { readonly kind: 'waiting' } | { readonly kind: 'playing'; readonly stop: TicketStop } | { readonly kind: 'stopped' } | { readonly kind: 'finished' };

export function createTicket(): SoundTicket {
  let state: TicketState = { kind: 'waiting' };
  return {
    get stopped(): boolean {
      return state.kind === 'stopped';
    },
    get over(): boolean {
      return state.kind === 'stopped' || state.kind === 'finished';
    },
    begin(stop: TicketStop): void {
      if (state.kind === 'waiting') state = { kind: 'playing', stop };
    },
    finish(): void {
      if (state.kind !== 'stopped') state = { kind: 'finished' };
    },
    stop(seconds: number): void {
      if (state.kind === 'playing') state.stop(seconds);
      if (state.kind !== 'finished') state = { kind: 'stopped' };
    },
  };
}

export interface HeldSounds {
  hold(owner: number, ticket: SoundTicket): void;
  release(owner: number): void;
  releaseAll(): void;
  count(owner: number): number;
}

export function createHeldSounds(): HeldSounds {
  const owned: Map<number, SoundTicket[]> = new Map<number, SoundTicket[]>();
  const stopAll = (tickets: readonly SoundTicket[]): void => {
    for (const ticket of tickets) ticket.stop(HELD.fadeSeconds);
  };
  return {
    hold(owner: number, ticket: SoundTicket): void {
      if (ticket.over) return;
      const live: SoundTicket[] = (owned.get(owner) ?? []).filter((held: SoundTicket): boolean => !held.over);
      live.push(ticket);
      owned.set(owner, live);
    },
    release(owner: number): void {
      stopAll(owned.get(owner) ?? []);
      owned.delete(owner);
    },
    releaseAll(): void {
      for (const tickets of owned.values()) stopAll(tickets);
      owned.clear();
    },
    count(owner: number): number {
      return (owned.get(owner) ?? []).filter((held: SoundTicket): boolean => !held.over).length;
    },
  };
}

export interface CuePlayer {
  play(cue: SoundCue): void;
  hold(cue: SoundCue): SoundTicket | null;
}

export function playChannelled(held: HeldSounds, channel: ChannelSound | null, cues: readonly SoundCue[], player: CuePlayer): void {
  if (channel?.type === 'release') held.release(channel.actorId);
  for (const cue of cues) {
    if (channel?.type !== 'hold') {
      player.play(cue);
      continue;
    }
    const ticket: SoundTicket | null = player.hold(cue);
    if (ticket !== null) held.hold(channel.actorId, ticket);
  }
}
