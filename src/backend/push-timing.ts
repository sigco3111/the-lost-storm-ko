export const PUSH: { readonly firstMs: number; readonly routineMs: number } = {
  firstMs: 1000,
  routineMs: 12_000,
};

export type PushWhen = { readonly kind: 'now' } | { readonly kind: 'after'; readonly ms: number };

export function pushWhen(urgent: boolean, claimed: boolean): PushWhen {
  if (urgent) return { kind: 'now' };
  return { kind: 'after', ms: claimed ? PUSH.routineMs : PUSH.firstMs };
}
