import type { Command } from './types.ts';

export const PRESS_BUFFER = {
  wait: 0.25,
  stale: 1.2,
} as const;

export type PressRank = 'dodge' | 'skill' | 'move';

export interface Buffered {
  readonly command: Command;
  readonly rank: PressRank;
  readonly at: number;
}

export interface PressBuffer {
  readonly dodge: Buffered | null;
  readonly skill: Buffered | null;
  readonly move: Buffered | null;
}

export const EMPTY_BUFFER: PressBuffer = { dodge: null, skill: null, move: null };

export const RANK_ORDER: readonly PressRank[] = ['dodge', 'skill', 'move'];

export interface Taken {
  readonly press: Buffered | null;
  readonly rest: PressBuffer;
}

export type Allowed = (command: Command) => boolean;

function olderThan(entry: Buffered | null, at: number): boolean {
  return entry !== null && entry.at <= at;
}

function keepsSkill(press: Buffered): boolean {
  const command: Command = press.command;
  return command.type === 'walk' || command.type === 'stop' || (command.type === 'move' && command.held);
}

export function bufferPress(buffer: PressBuffer, press: Buffered): PressBuffer {
  switch (press.rank) {
    case 'dodge':
      return { dodge: press, skill: olderThan(buffer.skill, press.at) ? null : buffer.skill, move: olderThan(buffer.move, press.at) ? null : buffer.move };
    case 'skill':
      return { dodge: buffer.dodge, skill: press, move: olderThan(buffer.move, press.at) ? null : buffer.move };
    case 'move':
      return { dodge: buffer.dodge, skill: keepsSkill(press) ? buffer.skill : null, move: press };
  }
  return buffer;
}

function without(buffer: PressBuffer, rank: PressRank): PressBuffer {
  switch (rank) {
    case 'dodge':
      return { ...buffer, dodge: null };
    case 'skill':
      return { ...buffer, skill: null };
    case 'move':
      return { ...buffer, move: null };
  }
  return buffer;
}

export function entryOf(buffer: PressBuffer, rank: PressRank): Buffered | null {
  switch (rank) {
    case 'dodge':
      return buffer.dodge;
    case 'skill':
      return buffer.skill;
    case 'move':
      return buffer.move;
  }
  return null;
}

export function takePress(buffer: PressBuffer, now: number, allowed: Allowed): Taken {
  let rest: PressBuffer = buffer;
  for (const rank of RANK_ORDER) {
    const entry: Buffered | null = entryOf(rest, rank);
    if (entry === null) continue;
    const age: number = now - entry.at;
    if (rank !== 'move' && age > PRESS_BUFFER.stale) {
      rest = without(rest, rank);
      continue;
    }
    if (age <= PRESS_BUFFER.wait && !allowed(entry.command)) return { press: null, rest };
    return { press: entry, rest: without(rest, rank) };
  }
  return { press: null, rest };
}

export function isEmpty(buffer: PressBuffer): boolean {
  return buffer.dodge === null && buffer.skill === null && buffer.move === null;
}
