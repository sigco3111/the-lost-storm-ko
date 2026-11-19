export const PACK = {
  count: 4,
  repeats: 5,
  groups: 1,
  gap: 8,
} as const;

export interface PackFight {
  readonly kind: 'pack';
  readonly monster: string;
  readonly count: number;
  readonly levels: readonly number[];
  readonly repeats: number;
  readonly minutes: number;
  readonly groups: number;
  readonly gap: number;
}

export interface PackMember {
  readonly monster: string;
  readonly count: number;
}

const MIX: RegExp = /^[a-z_]+(:[1-9]\d*)?(\+[a-z_]+(:[1-9]\d*)?)*$/;

export function packMix(spec: string): boolean {
  return MIX.test(spec);
}

export function packMembers(fight: Pick<PackFight, 'monster' | 'count'>): PackMember[] {
  return fight.monster.split('+').map((part: string): PackMember => {
    const [monster = '', count] = part.split(':');
    return { monster, count: count === undefined ? fight.count : Number(count) };
  });
}

export function packFoe(fight: Pick<PackFight, 'monster' | 'count'>): string {
  return packMembers(fight)
    .map((member: PackMember): string => `${member.count} ${member.monster}`)
    .join(' + ');
}

export function packLabel(fight: Pick<PackFight, 'monster' | 'count' | 'groups' | 'gap'>): string {
  const one: string = packFoe(fight);
  return fight.groups > 1 ? `${fight.groups} packs of ${one}, ${fight.gap} m apart` : one;
}
