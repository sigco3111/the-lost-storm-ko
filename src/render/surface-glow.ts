import type { IUniform, MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';
import { Color } from 'three';
import type { SurfaceGlow } from '../../sim/content/types.ts';
import { patchGroundShader, wetGroundKey } from './wet-ground.ts';

export const SURFACE_GLOW = {
  crustDarken: 0.45,
  pulseDepth: 0.3,
  driftX: 0.6,
  driftZ: 0.8,
  warpScale: 0.45,
  warpReach: 0.95,
  warpShift: 5.3,
  gapWidth: 0.55,
  gapSoft: 0.6,
  rimReach: 0.35,
  rimShare: 0.45,
  riverScale: 0.32,
  riverSoft: 0.08,
  riverDrift: 0.5,
  crackBlur: 2,
  crackFrom: 0.55,
  crackTo: 0.9,
  wobble: 0.12,
  plateJitter: 0.38,
  leastGap: 0.01,
  widthScale: 0.35,
  widthShift: 13.7,
  widthLeast: 0.35,
  widthMost: 2.4,
  coreLeast: 0.2,
  riverLeast: 0.4,
  openFrom: 0.38,
  openTo: 0.62,
  plateCarry: 0.55,
  shimmerScale: 2.7,
  shimmerSpeed: 2.2,
  shimmerLeast: 0.55,
  coreReach: 1.1,
  riverCore: 0.3,
  shoreReach: 0.25,
  shoreKeep: 0.3,
  warmTo: 0.55,
  hotFrom: 0.6,
  deep: [0.55, 0.16, 0.08],
  hot: [1.0, 0.64, 0.26],
  hotLift: 1.05,
  poolFrom: 0.3,
  mapWarp: 0.18,
  mapFlow: 0.22,
  mapSecondScale: 0.63,
  mapSecondSpeed: 0.55,
  mapSecondShift: 0.37,
  mapSecondShare: 0.85,
  mapHeatFrom: 0.06,
  mapHeatTo: 0.26,
  mapHotFrom: 0.7,
  mapCrustShade: 0.2,
  mapMoltenShade: 0.1,
} as const;

export const GLOW_CLOCK: IUniform<number> = { value: 0 };

export function tickGlow(time: number): void {
  GLOW_CLOCK.value = time;
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function glslColour(hex: string, strength: number, shift: readonly [number, number, number] = [1, 1, 1]): string {
  const colour: Color = new Color(hex);
  return `vec3( ${glsl(colour.r * strength * shift[0])}, ${glsl(colour.g * strength * shift[1])}, ${glsl(colour.b * strength * shift[2])} )`;
}

function glslHot(hex: string, strength: number): string {
  const colour: Color = new Color(hex);
  const [r, g, b] = SURFACE_GLOW.hot;
  const lift: number = strength * SURFACE_GLOW.hotLift;
  return `vec3( ${glsl(Math.max(colour.r, r) * lift)}, ${glsl(Math.max(colour.g, g) * lift)}, ${glsl(Math.max(colour.b, b) * lift)} )`;
}

export function glowKey(glow: SurfaceGlow | null): string {
  return glow === null ? '' : `:glow-${glow.lit}-${glow.color}-${glow.strength}-${glow.cover}-${glow.cracks}-${glow.scale}-${glow.flow}-${glow.pulse}`;
}

function tintLines(glow: SurfaceGlow): readonly string[] {
  const g = SURFACE_GLOW;
  if (glow.lit === 'tint') {
    return [
      `vec3 glowTint = mix( mix( ${glslColour(glow.color, glow.strength, g.deep)}, ${glslColour(glow.color, glow.strength)}, smoothstep( 0.0, ${glsl(g.warmTo)}, glowHeat ) ), ${glslHot(glow.color, glow.strength)}, smoothstep( ${glsl(g.hotFrom)}, 1.0, glowCore * glowShimmer ) );`,
      `diffuseColor.rgb *= mix( 1.0, ${glsl(g.crustDarken)}, glowMolten );`,
    ];
  }
  return [
    'float glowLavaHeat = glowHeat;',
    '#ifdef USE_MAP',
    `  vec2 glowFlowUv = vMapUv + ( vec2( glowFirst, glowSecond ) - 0.5 ) * ${glsl(g.mapWarp)} + glowDrift * ${glsl(g.mapFlow)};`,
    `  vec2 glowSecondUv = vMapUv * ${glsl(g.mapSecondScale)} - glowDrift * ${glsl(g.mapFlow * g.mapSecondSpeed)} + ${glsl(g.mapSecondShift)};`,
    `  vec3 glowSample = max( texture2D( map, glowFlowUv ).rgb, texture2D( map, glowSecondUv ).rgb * ${glsl(g.mapSecondShare)} );`,
    `  glowLavaHeat = smoothstep( ${glsl(g.mapHeatFrom)}, ${glsl(g.mapHeatTo)}, dot( glowSample, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * glowShimmer;`,
    '#endif',
    `vec3 glowTint = mix( mix( ${glslColour(glow.color, glow.strength, g.deep)}, ${glslColour(glow.color, glow.strength)}, smoothstep( 0.0, ${glsl(g.warmTo)}, glowLavaHeat ) ), ${glslHot(glow.color, glow.strength)}, smoothstep( ${glsl(g.mapHotFrom)}, 1.0, glowLavaHeat ) );`,
    `diffuseColor.rgb *= mix( ${glsl(g.mapCrustShade)}, ${glsl(g.mapMoltenShade)}, glowMolten );`,
  ];
}

export const GLOW_HELPERS: string = [
  'vec2 glowHash( vec2 p ) { p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ); return fract( sin( p ) * 43758.5453 ); }',
  'float glowPlates( vec2 p, float wobble ) {',
  '  vec2 cell = floor( p );',
  '  vec2 inCell = fract( p );',
  '  float nearest = 8.0;',
  '  float second = 8.0;',
  '  for ( int j = -1; j <= 1; j ++ ) {',
  '    for ( int i = -1; i <= 1; i ++ ) {',
  '      vec2 offset = vec2( float( i ), float( j ) );',
  '      vec2 seed = glowHash( cell + offset );',
  `      vec2 point = offset + 0.5 + ${glsl(SURFACE_GLOW.plateJitter)} * sin( wobble + seed * 6.2832 ) - inCell;`,
  '      float gap = dot( point, point );',
  '      second = min( max( gap, nearest ), second );',
  '      nearest = min( gap, nearest );',
  '    }',
  '  }',
  '  return sqrt( second ) - sqrt( nearest );',
  '}',
].join('\n');

export function glowFragment(glow: SurfaceGlow): string {
  const g = SURFACE_GLOW;
  const width: number = Math.max(glow.cover * g.gapWidth, g.leastGap);
  const riverEdge: number = 1 - glow.cover;
  const least: number = glow.cover >= g.poolFrom ? g.widthLeast : 0;
  const pulse: string = glow.pulse > 0 ? `1.0 - ${glsl(g.pulseDepth)} * 0.5 * ( 1.0 + sin( uGlowTime * ${glsl(glow.pulse * Math.PI * 2)} + glowFirst * 6.2832 ) )` : '1.0';
  return [
    `vec2 glowDrift = vec2( ${glsl(g.driftX)}, ${glsl(g.driftZ)} ) * uGlowTime * ${glsl(glow.flow)};`,
    `vec2 glowAt = vGroundXZ / ${glsl(glow.scale)};`,
    `float glowFirst = groundFbm( glowAt * ${glsl(g.warpScale)} + glowDrift );`,
    `float glowSecond = groundFbm( glowAt * ${glsl(g.warpScale)} - glowDrift + ${glsl(g.warpShift)} );`,
    `vec2 glowWarped = glowAt + ( vec2( glowFirst, glowSecond ) - 0.5 ) * ${glsl(g.warpReach * 2)};`,
    `float glowEdge = glowPlates( glowWarped - glowDrift * ${glsl(g.plateCarry)}, uGlowTime * ${glsl(glow.flow * g.wobble * 10)} );`,
    `float glowOpen = smoothstep( ${glsl(g.openFrom)}, ${glsl(g.openTo)}, groundFbm( glowAt * ${glsl(g.widthScale)} + ${glsl(g.widthShift)} - glowDrift ) );`,
    `float glowWidth = ${glsl(width)} * mix( ${glsl(least)}, ${glsl(g.widthMost)}, glowOpen );`,
    `float glowGap = ( 1.0 - smoothstep( glowWidth * ${glsl(1 - g.gapSoft)}, glowWidth * ${glsl(1 + g.gapSoft)} + ${glsl(g.leastGap)}, glowEdge ) ) * mix( ${glsl(g.coreLeast)}, 1.0, glowOpen );`,
    `float glowRim = exp( - max( glowEdge - glowWidth, 0.0 ) / ${glsl(g.rimReach)} ) * ${glsl(g.rimShare)} * glowOpen;`,
    `float glowRiverField = groundFbm( glowAt * ${glsl(g.riverScale)} + glowDrift * ${glsl(g.riverDrift)} );`,
    `float glowRiver = smoothstep( ${glsl(riverEdge - g.riverSoft)}, ${glsl(riverEdge + g.riverSoft)}, glowRiverField );`,
    'float glowCrack = 1.0;',
    '#ifdef USE_MAP',
    `  glowCrack = 1.0 - smoothstep( ${glsl(g.crackFrom)}, ${glsl(g.crackTo)}, dot( texture2D( map, vMapUv, ${glsl(g.crackBlur)} ).rgb, vec3( 0.333 ) ) / max( dot( texture2D( map, vMapUv, ${glsl(g.crackBlur + 3)} ).rgb, vec3( 0.333 ) ), 0.02 ) );`,
    '#endif',
    `float glowShore = mix( ${glsl(g.shoreKeep)}, 1.0, smoothstep( 0.0, ${glsl(g.shoreReach)}, groundShare - groundCut ) );`,
    `float glowMolten = max( glowGap, glowRiver * mix( ${glsl(g.riverLeast)}, 1.0, glowFirst ) ) * glowShore;`,
    `float glowMask = glowMolten + ( 1.0 - glowMolten ) * glowRim * mix( 1.0, glowCrack, ${glsl(glow.cracks)} );`,
    `float glowShimmer = mix( ${glsl(g.shimmerLeast)}, 1.0, groundNoise( glowAt * ${glsl(g.shimmerScale)} - glowDrift * ${glsl(g.shimmerSpeed)} ) );`,
    `float glowCore = max( ( 1.0 - smoothstep( 0.0, glowWidth * ${glsl(g.coreReach)} + ${glsl(g.leastGap)}, glowEdge ) ) * glowOpen, smoothstep( ${glsl(riverEdge)}, ${glsl(riverEdge + g.riverCore)}, glowRiverField ) ) * glowMolten;`,
    'float glowHeat = clamp( glowMask * glowShimmer, 0.0, 1.0 );',
    ...tintLines(glow),
    `totalEmissiveRadiance += glowTint * glowMask * ( ${pulse} );`,
  ].join('\n');
}

export function patchGlowShader(shader: Pick<WebGLProgramParametersWithUniforms, 'fragmentShader' | 'uniforms'>, glow: SurfaceGlow): void {
  shader.uniforms['uGlowTime'] = GLOW_CLOCK;
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `uniform float uGlowTime;\n${GLOW_HELPERS}\nvoid main() {`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${glowFragment(glow)}`);
}

export function glowingGround(material: MeshStandardMaterial, wet: number, glow: SurfaceGlow | null): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    patchGroundShader(shader, wet);
    if (glow !== null) patchGlowShader(shader, glow);
  };
  material.customProgramCacheKey = (): string => `${wetGroundKey(wet)}${glowKey(glow)}`;
}
