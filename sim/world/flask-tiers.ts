import type { FlaskDef, FlaskTier } from '../content/flasks.ts';
import type { Content } from '../content/types.ts';
import type { FlaskState, PlayerState } from './types.ts';

export type FlaskOffer =
  | { readonly kind: 'top'; readonly tier: number }
  | { readonly kind: 'locked'; readonly tier: number; readonly next: FlaskTier }
  | { readonly kind: 'short'; readonly tier: number; readonly next: FlaskTier; readonly missing: number }
  | { readonly kind: 'ready'; readonly tier: number; readonly next: FlaskTier };

export function baseFlask(content: Content, id: string): FlaskDef | null {
  return content.flasks.find((def: FlaskDef): boolean => def.id === id) ?? null;
}

export function clampTier(base: FlaskDef, tier: number): number {
  return Number.isInteger(tier) ? Math.max(0, Math.min(base.tiers.length, tier)) : 0;
}

export function tieredFlask(base: FlaskDef, tier: number): FlaskDef {
  const step: FlaskTier | undefined = base.tiers[clampTier(base, tier) - 1];
  if (step === undefined) return base;
  return { ...base, amount: step.amount, share: step.share, duration: step.duration, maxCharges: step.maxCharges, chargesPerKill: step.chargesPerKill };
}

export function flaskOffer(base: FlaskDef, tier: number, level: number, gold: number): FlaskOffer {
  const next: FlaskTier | undefined = base.tiers[tier];
  if (next === undefined) return { kind: 'top', tier };
  if (level < next.level) return { kind: 'locked', tier, next };
  if (gold < next.price) return { kind: 'short', tier, next, missing: next.price - gold };
  return { kind: 'ready', tier, next };
}

export function offerFor(content: Content, player: Pick<PlayerState, 'level' | 'gold'>, flask: FlaskState): FlaskOffer {
  const base: FlaskDef = baseFlask(content, flask.def.id) ?? flask.def;
  return flaskOffer(base, flask.tier, player.level, player.gold);
}

export function upgradeReady(content: Content, player: Pick<PlayerState, 'level' | 'gold'>, flask: FlaskState): boolean {
  return offerFor(content, player, flask).kind === 'ready';
}

export function anyUpgradeReady(content: Content, player: Pick<PlayerState, 'level' | 'gold' | 'flasks'>): boolean {
  return player.flasks.some((flask: FlaskState): boolean => upgradeReady(content, player, flask));
}

export function flaskTiers(flasks: readonly FlaskState[]): Record<string, number> {
  return Object.fromEntries(flasks.filter((flask: FlaskState): boolean => flask.tier > 0).map((flask: FlaskState): [string, number] => [flask.def.id, flask.tier]));
}

export function setFlaskTier(base: FlaskDef, flask: FlaskState, tier: number): void {
  flask.tier = clampTier(base, tier);
  flask.def = tieredFlask(base, flask.tier);
  flask.charges = flask.def.maxCharges;
}
