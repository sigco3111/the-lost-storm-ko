import type { ClickFacts } from './click-reading.ts';
import { resolveClick } from './click-reading.ts';
import type { Movement } from './settings/bindings.ts';

export const KEY_MOVE_HINT = {
  clicks: 2,
  windowSeconds: 4,
  quietSeconds: 60,
  text: '키로 영웅을 움직인다 · 설정 → 조작 → 이동',
} as const;

export interface KeyMoveHintState {
  readonly clicks: readonly number[];
  readonly shownAt: number | null;
}

export interface GroundClick {
  readonly at: number;
  readonly movement: Movement;
  readonly touch: boolean;
  readonly moveKeyHeld: boolean;
  readonly facts: ClickFacts;
}

export interface KeyMoveHintStep {
  readonly state: KeyMoveHintState;
  readonly show: boolean;
}

export const NO_KEY_MOVE_HINT: KeyMoveHintState = { clicks: [], shownAt: null };

export function walksByClick(facts: ClickFacts): boolean {
  return facts.fresh && resolveClick({ ...facts, keys: false }).kind === 'move';
}

export function noteGroundClick(state: KeyMoveHintState, click: GroundClick): KeyMoveHintStep {
  if (click.movement !== 'keys' || click.touch || click.moveKeyHeld) return { state: { clicks: [], shownAt: state.shownAt }, show: false };
  if (!walksByClick(click.facts)) return { state, show: false };
  const clicks: readonly number[] = [...state.clicks.filter((at: number): boolean => click.at - at <= KEY_MOVE_HINT.windowSeconds), click.at];
  const rested: boolean = state.shownAt === null || click.at - state.shownAt >= KEY_MOVE_HINT.quietSeconds;
  if (clicks.length >= KEY_MOVE_HINT.clicks && rested) return { state: { clicks: [], shownAt: click.at }, show: true };
  return { state: { clicks, shownAt: state.shownAt }, show: false };
}
