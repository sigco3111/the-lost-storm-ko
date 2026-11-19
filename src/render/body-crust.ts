import type { Box3, IUniform, Object3D, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { BufferGeometry, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { BodyCrust } from '../../sim/content/combat-types.ts';
import { GLOW_CLOCK } from './surface-glow.ts';

export const BODY_CRUST = {
  soft: 0.035,
  jitter: 0.85,
  pulseRate: 0.9,
  pulseDepth: 0.35,
  pulseSpread: 0.6,
  rimPower: 3.5,
  leastSpan: 0.0001,
} as const;

export interface CrustUniforms {
  readonly uCrustColor: IUniform<Color>;
  readonly uCrustCells: IUniform<number>;
  readonly uCrustSeam: IUniform<number>;
  readonly uCrustRim: IUniform<number>;
  readonly uCrustMin: IUniform<Vector3>;
  readonly uCrustSpan: IUniform<number>;
}

type CrustShader = Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader' | 'uniforms'>;

const CRUST_KEY: string = '-crust';

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

const CRUST_DECLARE: string = ['uniform vec3 uCrustColor;', 'uniform float uCrustCells;', 'uniform float uCrustSeam;', 'uniform float uCrustRim;', 'uniform float uCrustTime;', 'varying vec3 vCrustPos;'].join('\n');

export const CRUST_HELPERS: string = [
  'vec3 crustHash( vec3 p ) { p = vec3( dot( p, vec3( 127.1, 311.7, 74.7 ) ), dot( p, vec3( 269.5, 183.3, 246.1 ) ), dot( p, vec3( 113.5, 271.9, 124.6 ) ) ); return fract( sin( p ) * 43758.5453 ); }',
  'float crustCells( vec3 p ) {',
  '  vec3 cell = floor( p );',
  '  vec3 inCell = fract( p );',
  '  float first = 8.0;',
  '  float second = 8.0;',
  '  for ( int x = -1; x <= 1; x++ ) {',
  '    for ( int y = -1; y <= 1; y++ ) {',
  '      for ( int z = -1; z <= 1; z++ ) {',
  '        vec3 offset = vec3( float( x ), float( y ), float( z ) );',
  `        vec3 toward = offset + crustHash( cell + offset ) * ${glsl(BODY_CRUST.jitter)} - inCell;`,
  '        float reach = dot( toward, toward );',
  '        if ( reach < first ) { second = first; first = reach; } else if ( reach < second ) { second = reach; }',
  '      }',
  '    }',
  '  }',
  '  return sqrt( second ) - sqrt( first );',
  '}',
].join('\n');

export const CRUST_VERTEX: string = '#include <begin_vertex>\nvCrustPos = ( position - uCrustMin ) / uCrustSpan;';

export function crustFragment(): string {
  const c = BODY_CRUST;
  return [
    'vec3 crustPlace = vCrustPos * uCrustCells;',
    `float crustSeamGlow = 1.0 - smoothstep( uCrustSeam, uCrustSeam + ${glsl(c.soft)}, crustCells( crustPlace ) );`,
    `float crustPulse = 1.0 - ${glsl(c.pulseDepth)} * ( 0.5 + 0.5 * sin( uCrustTime * ${glsl(c.pulseRate)} + dot( crustPlace, vec3( ${glsl(c.pulseSpread)} ) ) ) );`,
    'float crustFacing = clamp( 1.0 - dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
    `totalEmissiveRadiance += uCrustColor * ( crustSeamGlow * crustPulse + uCrustRim * pow( crustFacing, ${glsl(c.rimPower)} ) );`,
  ].join('\n');
}

export function crustUniforms(crust: BodyCrust, glow: string, box: Box3): CrustUniforms {
  const size: Vector3 = box.getSize(new Vector3());
  return {
    uCrustColor: { value: new Color(glow).multiplyScalar(crust.strength) },
    uCrustCells: { value: crust.cells },
    uCrustSeam: { value: crust.seam },
    uCrustRim: { value: crust.rim },
    uCrustMin: { value: box.min.clone() },
    uCrustSpan: { value: Math.max(size.x, size.y, size.z, BODY_CRUST.leastSpan) },
  };
}

export function patchCrustShader(shader: CrustShader, uniforms: CrustUniforms): void {
  Object.assign(shader.uniforms, uniforms, { uCrustTime: GLOW_CLOCK });
  shader.vertexShader = shader.vertexShader.replace('void main() {', `uniform vec3 uCrustMin;\nuniform float uCrustSpan;\nvarying vec3 vCrustPos;\nvoid main() {`).replace('#include <begin_vertex>', CRUST_VERTEX);
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${CRUST_DECLARE}\n${CRUST_HELPERS}\nvoid main() {`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${crustFragment()}`);
}

export function crustMaterial(material: MeshStandardMaterial, uniforms: CrustUniforms): void {
  const compile: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void = material.onBeforeCompile.bind(material);
  const key: () => string = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    compile(shader, renderer);
    patchCrustShader(shader, uniforms);
  };
  material.customProgramCacheKey = (): string => `${key()}${CRUST_KEY}`;
}

function restBox(geometry: unknown): Box3 | null {
  if (!(geometry instanceof BufferGeometry)) return null;
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  return geometry.boundingBox;
}

export function crustBody(model: Object3D, crust: BodyCrust, glow: string): void {
  model.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const shape: unknown = object.geometry;
    const box: Box3 | null = restBox(shape);
    if (box === null || box.isEmpty()) return;
    const list: readonly unknown[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material instanceof MeshStandardMaterial) crustMaterial(material, crustUniforms(crust, glow, box));
  });
}
