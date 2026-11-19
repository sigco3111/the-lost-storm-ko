import type { Color, IUniform, MeshStandardMaterial, Texture, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { DataTexture, RGBAFormat } from 'three';
import type { GroundContact } from './lobby-contact.ts';
import { LOBBY_GROUND } from './lobby-ground.ts';
import type { Rubble, SetPiece, Skirt } from './lobby-sets.ts';
import { stepHash } from './lobby-skyline.ts';

export const LOBBY_SKIRT = {
  noiseScale: 1.8,
  noiseShare: 0.7,
  blendSharpness: 4,
  rubbleSink: 0.04,
  rubbleSeed: 17.3,
  cacheKey: 'lobby-skirt',
} as const;

export interface SkirtGround {
  readonly map: Texture | null;
  readonly color: Color;
  readonly metres: number;
}

export type SkirtUniforms = Readonly<Record<string, IUniform>>;

const PLAIN: DataTexture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
PLAIN.needsUpdate = true;

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

export function skirtUniforms(skirt: Skirt, ground: SkirtGround, contact: GroundContact): SkirtUniforms {
  return {
    ...contact.uniforms,
    uSkirtMap: { value: ground.map ?? PLAIN },
    uSkirtColor: { value: ground.color.clone() },
    uSkirtTile: { value: 1 / ground.metres },
    uSkirtHeight: { value: skirt.height },
    uSkirtContact: { value: skirt.contact },
    uSkirtDarken: { value: skirt.darken },
    uSkirtHue: { value: skirt.hue },
    uSkirtRadius: { value: LOBBY_GROUND.radius },
    uSkirtEdge: { value: LOBBY_GROUND.edgeShade },
  };
}

const PROJECT: string = '#include <project_vertex>';
const COLOUR: string = '#include <color_fragment>';

const VERTEX_HEAD: string = 'varying vec3 vSkirtWorld;\nvarying vec3 vSkirtNormal;';

const VERTEX_BODY: string = [
  'vec4 skirtWorld = vec4( transformed, 1.0 );',
  'vec3 skirtNormal = objectNormal;',
  '#ifdef USE_INSTANCING',
  '  skirtWorld = instanceMatrix * skirtWorld;',
  '  skirtNormal = mat3( instanceMatrix ) * skirtNormal;',
  '#endif',
  'skirtWorld = modelMatrix * skirtWorld;',
  'vSkirtWorld = skirtWorld.xyz;',
  'vSkirtNormal = normalize( mat3( modelMatrix ) * skirtNormal );',
].join('\n');

export const SKIRT_FRAGMENT_HEAD: string = [
  'varying vec3 vSkirtWorld;',
  'varying vec3 vSkirtNormal;',
  'uniform sampler2D uGroundField;',
  'uniform float uGroundSpan;',
  'uniform float uGroundLow;',
  'uniform float uGroundRange;',
  'uniform sampler2D uSkirtMap;',
  'uniform vec3 uSkirtColor;',
  'uniform float uSkirtTile;',
  'uniform float uSkirtHeight;',
  'uniform float uSkirtContact;',
  'uniform float uSkirtDarken;',
  'uniform float uSkirtHue;',
  'uniform float uSkirtRadius;',
  'uniform float uSkirtEdge;',
  'float skirtHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
  'float skirtNoise( vec2 p ) {',
  '  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );',
  '  return mix( mix( skirtHash( i ), skirtHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( skirtHash( i + vec2( 0.0, 1.0 ) ), skirtHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );',
  '}',
  'float skirtGround( vec2 xz ) { return uGroundLow + texture2D( uGroundField, xz / uGroundSpan + 0.5 ).r * uGroundRange; }',
  'vec3 skirtTexel() {',
  `  vec3 w = pow( abs( normalize( vSkirtNormal ) ), vec3( ${glsl(LOBBY_SKIRT.blendSharpness)} ) );`,
  '  w /= max( w.x + w.y + w.z, 1e-4 );',
  '  return texture2D( uSkirtMap, vSkirtWorld.zy * uSkirtTile ).rgb * w.x + texture2D( uSkirtMap, vSkirtWorld.xz * uSkirtTile ).rgb * w.y + texture2D( uSkirtMap, vSkirtWorld.xy * uSkirtTile ).rgb * w.z;',
  '}',
].join('\n');

export const SKIRT_FRAGMENT_BODY: string = [
  'float skirtAbove = vSkirtWorld.y - skirtGround( vSkirtWorld.xz );',
  `float skirtReach = uSkirtHeight * ( 1.0 - ${glsl(LOBBY_SKIRT.noiseShare / 2)} + ${glsl(LOBBY_SKIRT.noiseShare)} * skirtNoise( vSkirtWorld.xz * ${glsl(LOBBY_SKIRT.noiseScale)} + vSkirtWorld.y ) );`,
  'float skirtShare = 1.0 - smoothstep( 0.0, skirtReach, skirtAbove );',
  'vec3 skirtHueOf = uSkirtColor / max( dot( uSkirtColor, vec3( 0.3333 ) ), 1e-4 );',
  'diffuseColor.rgb = mix( diffuseColor.rgb, dot( diffuseColor.rgb, vec3( 0.3333 ) ) * skirtHueOf, uSkirtHue );',
  'float skirtFar = length( vSkirtWorld.xz ) / uSkirtRadius;',
  'vec3 skirtFloor = skirtTexel() * uSkirtColor * ( uSkirtEdge + ( 1.0 - uSkirtEdge ) * max( 0.0, 1.0 - skirtFar * skirtFar ) );',
  'diffuseColor.rgb = mix( diffuseColor.rgb, skirtFloor, skirtShare );',
  'diffuseColor.rgb *= mix( 1.0 - uSkirtDarken, 1.0, smoothstep( 0.0, uSkirtContact, skirtAbove ) );',
].join('\n');

export interface SkirtShader {
  vertexShader: string;
  fragmentShader: string;
  readonly uniforms: Record<string, IUniform>;
}

export function withSkirt(shader: SkirtShader, uniforms: SkirtUniforms): void {
  if (!shader.vertexShader.includes(PROJECT) || !shader.fragmentShader.includes(COLOUR)) throw new Error('The piece shader has no place for its ground skirt');
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = `${VERTEX_HEAD}\n${shader.vertexShader.replace(PROJECT, `${PROJECT}\n${VERTEX_BODY}`)}`;
  shader.fragmentShader = `${SKIRT_FRAGMENT_HEAD}\n${shader.fragmentShader.replace(COLOUR, `${COLOUR}\n${SKIRT_FRAGMENT_BODY}`)}`;
}

export function skirtMaterial(material: MeshStandardMaterial, uniforms: SkirtUniforms): void {
  const before: MeshStandardMaterial['onBeforeCompile'] = material.onBeforeCompile.bind(material);
  const key: string = material.customProgramCacheKey();
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    before(shader, renderer);
    withSkirt(shader, uniforms);
  };
  material.customProgramCacheKey = (): string => `${key}:${LOBBY_SKIRT.cacheKey}`;
}

export function shareOf(low: number, high: number, at: number): number {
  return low + (high - low) * at;
}

export function skirtRubble(pieces: readonly SetPiece[], rubble: Rubble, footprint: (piece: SetPiece) => number): readonly SetPiece[] {
  const placed: SetPiece[] = [];
  pieces.forEach((piece: SetPiece, index: number): void => {
    if (!piece.skirt || piece.y !== 0 || piece.swayDegrees > 0) return;
    const radius: number = footprint(piece);
    if (radius < rubble.minRadius) return;
    for (let stone: number = 0; stone < rubble.count; stone += 1) {
      const seed: number = index * LOBBY_SKIRT.rubbleSeed + stone;
      const turn: number = stepHash(seed, 1) * Math.PI * 2;
      const reach: number = radius * shareOf(rubble.from, rubble.to, stepHash(seed, 2));
      placed.push({
        prop: rubble.prop,
        x: piece.x + Math.cos(turn) * reach,
        z: piece.z + Math.sin(turn) * reach,
        y: 0,
        yawDegrees: stepHash(seed, 3) * 360,
        pitchDegrees: 0,
        rollDegrees: 0,
        size: shareOf(rubble.sizeMin, rubble.sizeMax, stepHash(seed, 4)),
        sink: LOBBY_SKIRT.rubbleSink,
        mound: false,
        swayDegrees: 0,
        skirt: true,
      });
    }
  });
  return placed;
}
