import type { SkillDef } from '../content/types.ts';

export interface SkillNumbers {
  readonly reach: number;
  readonly area: number;
  readonly duration: number;
  readonly count: number;
}

export function skillNumbers(skill: SkillDef): SkillNumbers {
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'arc':
      return { reach: delivery.reach, area: delivery.reach, duration: 0, count: 1 };
    case 'nova':
      return { reach: delivery.radius, area: delivery.radius, duration: 0, count: 1 };
    case 'projectile':
      return { reach: delivery.range, area: delivery.radius, duration: 0, count: delivery.count };
    case 'dash':
      return { reach: delivery.distance, area: 0, duration: delivery.duration, count: 1 };
    case 'mark':
      return { reach: delivery.range, area: delivery.radius, duration: delivery.delay, count: delivery.count };
    case 'revive':
      return { reach: delivery.range, area: 0, duration: 0, count: delivery.count };
    case 'field':
      return { reach: delivery.range, area: delivery.radius, duration: delivery.duration, count: 1 };
    case 'chain':
      return { reach: delivery.range, area: delivery.jumpRange, duration: 0, count: delivery.jumps };
    case 'area':
      return { reach: delivery.range, area: delivery.radius, duration: delivery.duration, count: 1 };
    case 'blink':
      return { reach: delivery.range, area: delivery.radius, duration: 0, count: 1 };
    case 'beam':
      return { reach: delivery.range, area: delivery.width, duration: 0, count: 1 };
  }
  return { reach: 0, area: 0, duration: 0, count: 0 };
}

export function movesHero(skill: SkillDef): boolean {
  return skill.delivery.type === 'dash' || skill.delivery.type === 'blink';
}
