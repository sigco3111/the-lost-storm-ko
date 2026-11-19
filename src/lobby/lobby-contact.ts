import type { IUniform, MeshBasicMaterial, Texture, WebGLProgramParametersWithUniforms } from 'three';
import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGBAFormat } from 'three';
import { groundHeight, LOBBY_GROUND } from './lobby-ground.ts';
import type { Mound } from './lobby-ground.ts';

export const LOBBY_CONTACT = {
  texels: 128,
  levels: 255,
  mistFeather: 0.6,
  shaftFeather: 0.5,
  cacheKey: 'lobby-ground-contact',
} as const;

export interface GroundField {
  readonly texels: number;
  readonly span: number;
  readonly low: number;
  readonly range: number;
  readonly levels: Uint8Array;
}

export function fieldCentre(index: number, texels: number, span: number): number {
  return ((index + 0.5) / texels - 0.5) * span;
}

export function groundField(mounds: readonly Mound[], texels: number = LOBBY_CONTACT.texels): GroundField {
  const span: number = LOBBY_GROUND.radius * 2;
  const heights: Float32Array = new Float32Array(texels * texels);
  for (let row: number = 0; row < texels; row += 1) {
    for (let column: number = 0; column < texels; column += 1) heights[row * texels + column] = groundHeight(fieldCentre(column, texels, span), fieldCentre(row, texels, span), mounds);
  }
  let low: number = Number.POSITIVE_INFINITY;
  let high: number = Number.NEGATIVE_INFINITY;
  for (const height of heights) {
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  const range: number = Math.max(high - low, Number.EPSILON);
  const levels: Uint8Array = new Uint8Array(texels * texels);
  heights.forEach((height: number, at: number): void => {
    levels[at] = Math.round(((height - low) / range) * LOBBY_CONTACT.levels);
  });
  return { texels, span, low, range, levels };
}

function level(field: GroundField, column: number, row: number): number {
  const clampedColumn: number = Math.min(field.texels - 1, Math.max(0, column));
  const clampedRow: number = Math.min(field.texels - 1, Math.max(0, row));
  return field.levels[clampedRow * field.texels + clampedColumn] ?? 0;
}

export function fieldHeight(field: GroundField, x: number, z: number): number {
  const u: number = (x / field.span + 0.5) * field.texels - 0.5;
  const v: number = (z / field.span + 0.5) * field.texels - 0.5;
  const column: number = Math.floor(u);
  const row: number = Math.floor(v);
  const across: number = u - column;
  const down: number = v - row;
  const near: number = level(field, column, row) + (level(field, column + 1, row) - level(field, column, row)) * across;
  const far: number = level(field, column, row + 1) + (level(field, column + 1, row + 1) - level(field, column, row + 1)) * across;
  return field.low + ((near + (far - near) * down) / LOBBY_CONTACT.levels) * field.range;
}

export function contactShare(height: number, ground: number, feather: number): number {
  const t: number = Math.min(1, Math.max(0, (height - ground) / feather));
  return t * t * (3 - 2 * t);
}

export const CONTACT_HEAD: string = `
uniform sampler2D uGroundField;
uniform float uGroundSpan;
uniform float uGroundLow;
uniform float uGroundRange;
varying vec3 vContactWorld;

float groundContact(float feather) {
  vec2 at = vContactWorld.xz / uGroundSpan + 0.5;
  float ground = uGroundLow + texture2D(uGroundField, at).r * uGroundRange;
  return smoothstep(ground, ground + feather, vContactWorld.y);
}
`;

export const CONTACT_VERTEX_HEAD: string = 'varying vec3 vContactWorld;';

export const CONTACT_VERTEX: string = 'vContactWorld = (modelMatrix * vec4(position, 1.0)).xyz;';

export interface GroundContact {
  readonly uniforms: Readonly<Record<'uGroundField' | 'uGroundSpan' | 'uGroundLow' | 'uGroundRange', IUniform>>;
  readonly field: GroundField;
}

function fieldTexture(field: GroundField): Texture {
  const data: Uint8Array = new Uint8Array(field.texels * field.texels * 4);
  field.levels.forEach((value: number, at: number): void => {
    data.fill(value, at * 4, at * 4 + 3);
    data[at * 4 + 3] = LOBBY_CONTACT.levels;
  });
  const texture: DataTexture = new DataTexture(data, field.texels, field.texels, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function groundContact(mounds: readonly Mound[]): GroundContact {
  const field: GroundField = groundField(mounds);
  const texture: Texture = fieldTexture(field);
  return {
    uniforms: {
      uGroundField: { value: texture },
      uGroundSpan: { value: field.span },
      uGroundLow: { value: field.low },
      uGroundRange: { value: field.range },
    },
    field,
  };
}

const BASIC_PROJECT: string = '#include <project_vertex>';
const BASIC_ALPHA: string = '#include <alphamap_fragment>';

export type ContactShader = Pick<WebGLProgramParametersWithUniforms, 'uniforms' | 'vertexShader' | 'fragmentShader'>;

export function withGroundContact(shader: ContactShader, contact: GroundContact, feather: number): void {
  if (!shader.vertexShader.includes(BASIC_PROJECT) || !shader.fragmentShader.includes(BASIC_ALPHA)) throw new Error('The mist shader has no place for its ground contact');
  Object.assign(shader.uniforms, contact.uniforms);
  shader.vertexShader = `${CONTACT_VERTEX_HEAD}\n${shader.vertexShader.replace(BASIC_PROJECT, `${BASIC_PROJECT}\n${CONTACT_VERTEX}`)}`;
  shader.fragmentShader = `${CONTACT_HEAD}\n${shader.fragmentShader.replace(BASIC_ALPHA, `${BASIC_ALPHA}\ndiffuseColor.a *= groundContact(${feather.toFixed(3)});`)}`;
}

export function softenOnGround(material: MeshBasicMaterial, contact: GroundContact, feather: number): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    withGroundContact(shader, contact, feather);
  };
  material.customProgramCacheKey = (): string => `${LOBBY_CONTACT.cacheKey}:${feather}`;
}
