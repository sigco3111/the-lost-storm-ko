import type { MomentumDef, MomentumTier } from '../../sim/content/shape-types.ts';
import { momentumDef, momentumShare, steadied } from '../../sim/world/momentum.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { Spring } from './character-spring.ts';
import { springTo, stepSpring } from './character-spring.ts';
import { clamp01, el } from './dom.ts';

export const MOMENTUM_METER = {
  longestFrame: 0.1,
  hidden: 0.002,
} as const;

export interface MomentumMeterState {
  readonly fill: Spring;
  readonly shown: Spring;
  readonly steady: Spring;
}

export interface MomentumReading {
  readonly fill: number;
  readonly shown: number;
  readonly steady: number;
  readonly steps: readonly number[];
}

export function createMeterState(): MomentumMeterState {
  return { fill: { value: 0, velocity: 0, target: 0 }, shown: { value: 0, velocity: 0, target: 0 }, steady: { value: 0, velocity: 0, target: 0 } };
}

function carried(player: PlayerState): MomentumDef | null {
  return momentumDef(player) ?? player.skills.find((skill: SkillDef | null): boolean => skill !== null && skill.momentum !== null)?.momentum ?? null;
}

export function readMomentum(state: MomentumMeterState, player: PlayerState, dt: number): MomentumReading {
  const def: MomentumDef | null = carried(player);
  const share: number = momentumShare(player);
  const spinning: boolean = player.action !== null && player.action.skill.momentum !== null;
  springTo(state.fill, share);
  springTo(state.shown, def !== null && (spinning || share > 0) ? 1 : 0);
  springTo(state.steady, steadied(player) ? 1 : 0);
  for (const spring of [state.fill, state.shown, state.steady]) stepSpring(spring, dt);
  const steps: readonly number[] = def === null ? [] : def.tiers.map((tier: MomentumTier): number => tier.at / def.cap);
  return { fill: clamp01(state.fill.value), shown: clamp01(state.shown.value), steady: clamp01(state.steady.value), steps };
}

export interface MomentumMeter {
  update(player: PlayerState): void;
}

export function createMomentumMeter(parent: HTMLElement): MomentumMeter {
  const root: HTMLDivElement = el('div', 'hud-momentum', parent);
  el('div', 'hud-momentum-fill', root);
  const state: MomentumMeterState = createMeterState();
  let marks: string = '';
  let last: number | null = null;
  return {
    update(player: PlayerState): void {
      const now: number = performance.now();
      const dt: number = last === null ? 0 : Math.min(MOMENTUM_METER.longestFrame, (now - last) / 1000);
      last = now;
      const reading: MomentumReading = readMomentum(state, player, dt);
      const steps: string = reading.steps.join(',');
      if (steps !== marks) {
        marks = steps;
        for (const old of root.querySelectorAll('.hud-momentum-step')) old.remove();
        for (const at of reading.steps) el('div', 'hud-momentum-step', root).style.left = `${(at * 100).toFixed(1)}%`;
      }
      root.style.visibility = reading.shown > MOMENTUM_METER.hidden ? 'visible' : 'hidden';
      root.style.setProperty('--m-show', reading.shown.toFixed(3));
      root.style.setProperty('--m-fill', reading.fill.toFixed(4));
      root.style.setProperty('--m-steady', reading.steady.toFixed(3));
    },
  };
}
