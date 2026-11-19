import type { Delivery, SkillDef, SkillVfx } from './content/types.ts';

export function widerWave(vfx: SkillVfx, scale: number): SkillVfx {
  if (vfx.wave === null || scale === 1) return vfx;
  return { ...vfx, wave: { ...vfx.wave, halfWidth: vfx.wave.halfWidth * scale } };
}

export function widened(delivery: Delivery, scale: number): Delivery {
  switch (delivery.type) {
    case 'arc':
      return { ...delivery, reach: delivery.reach * scale };
    case 'nova':
    case 'mark':
    case 'field':
    case 'area':
    case 'blink':
    case 'projectile':
      return { ...delivery, radius: delivery.radius * scale };
    case 'chain':
      return { ...delivery, jumpRange: delivery.jumpRange * scale };
    case 'beam':
      return { ...delivery, range: delivery.range * scale };
    case 'dash':
    case 'revive':
      return delivery;
  }
  return delivery;
}

export function widenedSkill(skill: SkillDef, scale: number): SkillDef {
  if (scale === 1) return skill;
  return { ...skill, delivery: widened(skill.delivery, scale), vfx: widerWave(skill.vfx, scale) };
}

export function lengthened(delivery: Delivery, scale: number): Delivery {
  switch (delivery.type) {
    case 'projectile':
    case 'mark':
    case 'field':
    case 'area':
    case 'blink':
    case 'chain':
    case 'beam':
    case 'revive':
      return { ...delivery, range: delivery.range * scale };
    case 'dash':
      return { ...delivery, distance: delivery.distance * scale };
    case 'arc':
    case 'nova':
      return delivery;
  }
  return delivery;
}
