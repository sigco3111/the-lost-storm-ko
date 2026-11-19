import type { IUniform, Material, Object3D } from 'three';
import { Mesh, MeshStandardMaterial } from 'three';
import type { RigGlow } from './ghost-material.ts';
import type { VfxShadow } from '../../sim/content/vfx-types.ts';
import { isInvulnerable } from '../../sim/world/dash.ts';
import type { EmpowerLook } from '../../sim/content/types.ts';
import type { ActorState, EmpowerState, PowerState } from '../../sim/world/types.ts';

export const SHADOW_SHADE = {
  floor: 0.06,
  luma: 0.3,
  see: 0.45,
  rim: 1,
  rimPower: 2,
  stiffness: 600,
  damping: 46,
  settle: 0.002,
  wetDark: 0.2,
  wetGloss: 0.45,
  wetRim: 0.15,
  programKey: 'storm-shade',
} as const;

export const SHADOW_UNIFORMS: string = 'uniform vec3 uShade;\nuniform float uShadeMix;\nuniform float uShadeWet;';

export const SHADOW_BODY: readonly string[] = [
  'float shadeLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );',
  `diffuseColor.rgb = mix( diffuseColor.rgb, uShade * ( ${SHADOW_SHADE.floor.toFixed(2)} + shadeLuma * ${SHADOW_SHADE.luma.toFixed(2)} ), uShadeMix );`,
  `diffuseColor.rgb *= 1.0 - uShadeWet * ${SHADOW_SHADE.wetDark.toFixed(2)};`,
  `diffuseColor.a *= 1.0 - uShadeMix * ${SHADOW_SHADE.see.toFixed(2)};`,
  'totalEmissiveRadiance *= 1.0 - uShadeMix;',
];

const SHADE_SHINE: string = `1.0 - uShadeMix + uShadeWet * ${SHADOW_SHADE.wetGloss.toFixed(2)}`;

export const SHADOW_LIGHT: string = `reflectedLight.directSpecular *= ${SHADE_SHINE};\nreflectedLight.indirectSpecular *= ${SHADE_SHINE};`;

export function shadowRim(facing: string): string {
  return `uShade * pow( ${facing}, ${SHADOW_SHADE.rimPower.toFixed(2)} ) * ${SHADOW_SHADE.rim.toFixed(2)} * max( uShadeMix, uShadeWet * ${SHADOW_SHADE.wetRim.toFixed(2)} )`;
}

export function bindShade(uniforms: Record<string, IUniform>, glow: RigGlow): void {
  uniforms['uShade'] = glow.shade;
  uniforms['uShadeMix'] = glow.shadeMix;
  uniforms['uShadeWet'] = glow.shadeWet;
}

export interface ShadeMotion {
  value: number;
  speed: number;
}

export function stepShade(motion: ShadeMotion, target: number, dt: number): void {
  const pull: number = SHADOW_SHADE.stiffness * (target - motion.value) - SHADOW_SHADE.damping * motion.speed;
  motion.speed += pull * dt;
  motion.value += motion.speed * dt;
  if (Math.abs(target - motion.value) < SHADOW_SHADE.settle && Math.abs(motion.speed) < SHADOW_SHADE.settle) {
    motion.value = target;
    motion.speed = 0;
  }
  motion.value = Math.min(1, Math.max(0, motion.value));
}

export function seeThrough(materials: readonly Material[], see: boolean): void {
  for (const material of materials) {
    if (material.transparent === see) continue;
    material.transparent = see;
    material.needsUpdate = true;
  }
}

export function shadowOf(actor: ActorState): VfxShadow | null {
  if (actor.action === null) return null;
  if (actor.action.skill.delivery.type !== 'blink' && !isInvulnerable(actor)) return null;
  return actor.action.skill.vfx.shadow;
}

export function veilOf(powers: PowerState): EmpowerLook | null {
  return powers.empowers.find((held: EmpowerState): boolean => held.look !== null)?.look ?? null;
}

export function shadeFragment(source: string): string {
  return source
    .replace('void main() {', `${SHADOW_UNIFORMS}\nvoid main() {`)
    .replace('#include <emissivemap_fragment>', ['#include <emissivemap_fragment>', 'float shadeFacing = clamp( 1.0 - dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );', ...SHADOW_BODY, `totalEmissiveRadiance += ${shadowRim('shadeFacing')};`].join('\n'))
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${SHADOW_LIGHT}`);
}

export function shadedCopy(source: MeshStandardMaterial, glow: RigGlow): MeshStandardMaterial {
  const material: MeshStandardMaterial = source.clone();
  material.onBeforeCompile = (shader): void => {
    bindShade(shader.uniforms, glow);
    shader.fragmentShader = shadeFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = (): string => SHADOW_SHADE.programKey;
  return material;
}

export function shadeHeld(copy: Object3D, glow: RigGlow, sink: MeshStandardMaterial[]): void {
  copy.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const source: unknown = object.material;
    if (!(source instanceof MeshStandardMaterial)) return;
    const material: MeshStandardMaterial = shadedCopy(source, glow);
    object.material = material;
    sink.push(material);
  });
}
