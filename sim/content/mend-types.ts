export const NOVA_SIDES = ['foes', 'allies'] as const;
export type NovaSide = (typeof NOVA_SIDES)[number];

export interface SkillMend {
  readonly flat: number;
  readonly lifeShare: number;
}
