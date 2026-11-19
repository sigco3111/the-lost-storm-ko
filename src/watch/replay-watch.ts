import type { Content } from '../../sim/content/types.ts';
import { RL } from '../../sim/rl/contract.ts';
import { DUEL } from '../../sim/rl/duel.ts';
import type { DuelReplayer, KeptReplay } from '../../sim/rl/duel-replay.ts';
import { createDuelReplayer, duelReplayerDone, duelReplayTick, readKeptReplay } from '../../sim/rl/duel-replay.ts';
import type { Replayer } from '../../sim/rl/replayer.ts';
import { createReplayer, replayerDone, replayTick } from '../../sim/rl/replayer.ts';
import type { DuelSeat } from '../../sim/rl/duel.ts';
import type { World, WorldEvent } from '../../sim/world/types.ts';

export const WATCH = {
  param: 'replay',
  speedParam: 'speed',
  minSpeed: 0.25,
  maxSpeed: 8,
  maxTicksPerFrame: 64,
} as const;

export type Watched = { readonly kind: 'arena'; readonly replayer: Replayer } | { readonly kind: 'duel'; readonly replayer: DuelReplayer };

export interface Watching {
  readonly watched: Watched;
  readonly speed: number;
  carry: number;
}

export interface WatchRequest {
  readonly path: string;
  readonly speed: number;
}

function localPath(asked: string, origin: string): string | null {
  try {
    const url: URL = new URL(asked, `${origin}/`);
    return url.origin === origin ? `${url.pathname}${url.search}` : null;
  }
  catch {
    return null;
  }
}

export function watchRequest(search: string, origin: string): WatchRequest | null {
  const params: URLSearchParams = new URLSearchParams(search);
  const asked: string | null = params.get(WATCH.param);
  if (asked === null || asked === '') return null;
  const path: string | null = localPath(asked, origin);
  if (path === null) return null;
  const raw: string = (params.get(WATCH.speedParam) ?? '').trim();
  const wanted: number = raw === '' ? 1 : Number(raw);
  const speed: number = Number.isFinite(wanted) ? Math.min(WATCH.maxSpeed, Math.max(WATCH.minSpeed, wanted)) : 1;
  return { path, speed };
}

function watchedOf(content: Content, replay: KeptReplay): Watched {
  return replay.situation === 'arena' ? { kind: 'arena', replayer: createReplayer(content, replay) } : { kind: 'duel', replayer: createDuelReplayer(content, replay) };
}

export function startWatching(content: Content, raw: unknown, speed: number): Watching {
  return { watched: watchedOf(content, readKeptReplay(raw)), speed, carry: 0 };
}

export function watchedWorld(watching: Watching): World {
  const watched: Watched = watching.watched;
  return watched.kind === 'arena' ? watched.replayer.arena.world : watched.replayer.duel.world;
}

export function watchedTicks(watching: Watching): number {
  return watching.watched.replayer.ticks;
}

export function watchDone(watching: Watching): boolean {
  const watched: Watched = watching.watched;
  return watched.kind === 'arena' ? replayerDone(watched.replayer) : duelReplayerDone(watched.replayer);
}

function tickOnce(watched: Watched): WorldEvent[] {
  return watched.kind === 'arena' ? replayTick(watched.replayer) : duelReplayTick(watched.replayer);
}

export async function fetchWatching(content: Content, request: WatchRequest): Promise<Watching> {
  const response: Response = await fetch(request.path);
  if (!response.ok) throw new Error(`replay ${request.path} answered ${response.status}`);
  const raw: unknown = await response.json();
  return startWatching(content, raw, request.speed);
}

export function watchTicks(watching: Watching, dt: number): WorldEvent[] {
  watching.carry += dt * watching.speed;
  const due: number = Math.min(WATCH.maxTicksPerFrame, Math.floor(watching.carry / RL.tick));
  watching.carry -= due * RL.tick;
  const events: WorldEvent[] = [];
  for (let tick: number = 0; tick < due && !watchDone(watching); tick += 1) events.push(...tickOnce(watching.watched));
  return events;
}

function labelOf(label: string): string {
  return label === '' ? 'replay' : label;
}

function duelCaption(replayer: DuelReplayer, done: boolean): string {
  const label: string = labelOf(replayer.replay.label);
  if (!done) return `Model duel ${label} · seed ${replayer.replay.options.seed} · ${Math.ceil(Math.max(0, DUEL.timeLimit - (replayer.duel.world.time - replayer.duel.start)))} s left`;
  return `Model duel ${label} · ${replayer.duel.seats.map((seat: DuelSeat): string => seat.outcome).join(' · ')}`;
}

export function watchCaption(watching: Watching): string {
  const watched: Watched = watching.watched;
  if (watched.kind === 'duel') return duelCaption(watched.replayer, duelReplayerDone(watched.replayer));
  const replay = watched.replayer.replay;
  const arena = watched.replayer.arena;
  const label: string = labelOf(replay.label);
  if (!replayerDone(watched.replayer)) return `Model replay ${label} · seed ${replay.options.seed} · wave ${arena.wave} of ${replay.options.waves}`;
  return `Model replay ${label} · ${arena.outcome} · ${arena.tally.waves} of ${replay.options.waves} waves cleared`;
}
