export const FRAME_WATCH = {
  checkMs: 1000,
  stallMs: 3000,
} as const;

export type WatchPhase = 'quiet' | 'rearmed' | 'offered';

export interface WatchState {
  readonly phase: WatchPhase;
  readonly since: number;
}

export type WatchSignal = { readonly type: 'stepped'; readonly at: number } | { readonly type: 'check'; readonly at: number; readonly watching: boolean } | { readonly type: 'resume'; readonly at: number };

export type WatchEffect = 'rearm' | 'offer' | 'clear';

export interface WatchStep {
  readonly state: WatchState;
  readonly effects: readonly WatchEffect[];
}

export function startWatch(at: number): WatchState {
  return { phase: 'quiet', since: at };
}

function cleared(state: WatchState): readonly WatchEffect[] {
  return state.phase === 'offered' ? ['clear'] : [];
}

function stalled(state: WatchState, at: number): WatchStep {
  if (state.phase === 'quiet') return { state: { phase: 'rearmed', since: at }, effects: ['rearm'] };
  if (state.phase === 'rearmed') return { state: { phase: 'offered', since: at }, effects: ['offer'] };
  return { state, effects: [] };
}

export function nextWatch(state: WatchState, signal: WatchSignal): WatchStep {
  if (signal.type === 'stepped') return { state: startWatch(signal.at), effects: cleared(state) };
  if (signal.type === 'resume') return { state: { phase: 'rearmed', since: signal.at }, effects: [...cleared(state), 'rearm'] };
  if (!signal.watching) return { state: startWatch(signal.at), effects: cleared(state) };
  if (signal.at - state.since < FRAME_WATCH.stallMs) return { state, effects: [] };
  return stalled(state, signal.at);
}
