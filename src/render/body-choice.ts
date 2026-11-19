export interface RigLike {
  readonly def: {
    readonly id: string;
    readonly frame: string;
  };
}

export type BodyChoice<R extends RigLike> = { readonly kind: 'own'; readonly rig: R } | { readonly kind: 'stand_in'; readonly rig: R; readonly late: string } | { readonly kind: 'none' };

export interface BodyWait {
  readonly standIn: boolean;
  readonly partial: boolean;
}

export function chooseBody<R extends RigLike>(rigs: ReadonlyMap<string, R>, wanted: string, frame: string | null, fallback: string): BodyChoice<R> {
  const own: R | undefined = rigs.get(wanted);
  if (own !== undefined) return { kind: 'own', rig: own };
  const sameFrame: R | undefined = frame === null ? undefined : [...rigs.values()].find((rig: R): boolean => rig.def.frame === frame);
  const standIn: R | undefined = sameFrame ?? rigs.get(fallback);
  return standIn === undefined ? { kind: 'none' } : { kind: 'stand_in', rig: standIn, late: wanted };
}

export function bodyArrived(wait: BodyWait, rigLoaded: boolean, missing: readonly string[]): boolean {
  if (wait.standIn) return rigLoaded;
  return wait.partial && missing.length === 0;
}
