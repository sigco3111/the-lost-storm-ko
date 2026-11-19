import type { IUniform, Texture } from 'three';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
import type { Content, SurfaceDef, SurfaceGlow, ZoneDef, ZoneFall } from '../../sim/content/types.ts';
import { GLOW_CLOCK, SURFACE_GLOW } from './surface-glow.ts';
import { surfaceColourMap } from './surfaces.ts';
import { liftAt } from './terrain-lift.ts';

export const LAVA_FALL = {
  columns: 9,
  rows: 28,
  run: 1.4,
  curl: 0.5,
  foot: 1.2,
  probe: 1.2,
  lift: 0.05,
  spread: 0.3,
  spreadReach: 4,
  curlSteps: 6,
  leastDrop: 0.4,
  flow: 1.1,
  stretch: 0.55,
  secondScale: 0.7,
  secondSpeed: 1.37,
  secondShift: 0.31,
  secondShare: 0.85,
  sideFeather: 0.3,
  edgeNoise: 0.35,
  edgeScale: 1.6,
  edgeAcross: 3,
  headFade: 0.12,
  footFade: 0.2,
  strength: 0.95,
  order: 2,
} as const;

export interface FallPoint {
  readonly along: number;
  readonly out: number;
  readonly y: number;
}

function arc(out: number, y: number, radius: number, from: number, to: number, steps: number, around: (angle: number) => readonly [number, number]): [number, number][] {
  const points: [number, number][] = [];
  for (let step: number = 1; step <= steps; step += 1) {
    const [dx, dy] = around(from + ((to - from) * step) / steps);
    points.push([out + dx * radius, y + dy * radius]);
  }
  return points;
}

function outline(top: number, bottom: number): [number, number][] {
  const drop: number = Math.max(top - bottom, LAVA_FALL.leastDrop);
  const low: number = top - drop;
  const radius: number = Math.min(LAVA_FALL.curl, drop / 2);
  return [
    [-LAVA_FALL.run, top],
    [0, top],
    ...arc(0, top - radius, radius, 0, Math.PI / 2, LAVA_FALL.curlSteps, (angle: number): readonly [number, number] => [Math.sin(angle), Math.cos(angle)]),
    [radius, low + radius],
    ...arc(radius * 2, low + radius, radius, 0, Math.PI / 2, LAVA_FALL.curlSteps, (angle: number): readonly [number, number] => [-Math.cos(angle), -Math.sin(angle)]),
    [radius * 2 + LAVA_FALL.foot, low],
  ];
}

export function fallProfile(top: number, bottom: number, rows: number = LAVA_FALL.rows): FallPoint[] {
  const corners: [number, number][] = outline(top, bottom);
  const lengths: number[] = [0];
  for (let index: number = 1; index < corners.length; index += 1) {
    const [ax, ay] = corners[index - 1] ?? [0, 0];
    const [bx, by] = corners[index] ?? [0, 0];
    lengths.push((lengths[index - 1] ?? 0) + Math.hypot(bx - ax, by - ay));
  }
  const total: number = lengths.at(-1) ?? 0;
  const points: FallPoint[] = [];
  let segment: number = 1;
  for (let row: number = 0; row < rows; row += 1) {
    const along: number = (total * row) / (rows - 1);
    while (segment < corners.length - 1 && (lengths[segment] ?? 0) < along) segment += 1;
    const start: number = lengths[segment - 1] ?? 0;
    const span: number = Math.max((lengths[segment] ?? 0) - start, Number.EPSILON);
    const share: number = Math.min(1, Math.max(0, (along - start) / span));
    const [ax, ay] = corners[segment - 1] ?? [0, 0];
    const [bx, by] = corners[segment] ?? [0, 0];
    points.push({ along, out: ax + (bx - ax) * share, y: ay + (by - ay) * share });
  }
  return points;
}

export interface FallMesh {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly shares: Float32Array;
  readonly indices: Uint32Array;
}

export function fallMesh(fall: ZoneFall, top: number, bottom: number): FallMesh {
  const { columns, rows } = LAVA_FALL;
  const profile: FallPoint[] = fallProfile(top, bottom, rows);
  const total: number = profile.at(-1)?.along ?? 1;
  const yaw: number = (fall.facingDegrees * Math.PI) / 180;
  const ahead: readonly [number, number] = [Math.sin(yaw), Math.cos(yaw)];
  const side: readonly [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
  const positions: Float32Array = new Float32Array(columns * rows * 3);
  const uvs: Float32Array = new Float32Array(columns * rows * 2);
  const shares: Float32Array = new Float32Array(columns * rows * 2);
  profile.forEach((point: FallPoint, row: number): void => {
    const past: number = Math.max(0, point.out) / Math.max(total, Number.EPSILON);
    const half: number = (fall.width / 2) * (1 + LAVA_FALL.spread * Math.min(1, past * LAVA_FALL.spreadReach));
    for (let column: number = 0; column < columns; column += 1) {
      const across: number = column / (columns - 1);
      const offset: number = (across - 0.5) * 2 * half;
      const at: number = row * columns + column;
      positions[at * 3] = fall.x + ahead[0] * point.out + side[0] * offset;
      positions[at * 3 + 1] = point.y + LAVA_FALL.lift;
      positions[at * 3 + 2] = fall.z + ahead[1] * point.out + side[1] * offset;
      uvs[at * 2] = offset;
      uvs[at * 2 + 1] = point.along;
      shares[at * 2] = across;
      shares[at * 2 + 1] = point.along / Math.max(total, Number.EPSILON);
    }
  });
  const indices: Uint32Array = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let cursor: number = 0;
  for (let row: number = 0; row < rows - 1; row += 1) {
    for (let column: number = 0; column < columns - 1; column += 1) {
      const a: number = row * columns + column;
      const b: number = a + 1;
      const c: number = a + columns;
      const d: number = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  return { positions, uvs, shares, indices };
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

export const FALL_VERTEX: string = [
  '#include <common>',
  '#include <fog_pars_vertex>',
  'attribute vec2 fall;',
  'varying vec2 vFall;',
  'varying vec2 vFallUv;',
  'void main() {',
  '  vFall = fall;',
  '  vFallUv = uv;',
  '  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
  '  gl_Position = projectionMatrix * mvPosition;',
  '  #include <fog_vertex>',
  '}',
].join('\n');

export function fallFragment(): string {
  const f = LAVA_FALL;
  const g = SURFACE_GLOW;
  return [
    '#include <common>',
    '#include <fog_pars_fragment>',
    'uniform sampler2D uMap;',
    'uniform float uGlowTime;',
    'uniform float uMetres;',
    'uniform vec3 uDeep;',
    'uniform vec3 uWarm;',
    'uniform vec3 uHot;',
    'varying vec2 vFall;',
    'varying vec2 vFallUv;',
    'float fallHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
    'float fallNoise( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f ); return mix( mix( fallHash( i ), fallHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fallHash( i + vec2( 0.0, 1.0 ) ), fallHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }',
    'void main() {',
    `  vec2 fallFirst = vec2( vFallUv.x, vFallUv.y * ${glsl(f.stretch)} - uGlowTime * ${glsl(f.flow)} ) / uMetres;`,
    `  vec2 fallSecond = vec2( vFallUv.x * ${glsl(f.secondScale)} + ${glsl(f.secondShift)}, vFallUv.y * ${glsl(f.stretch * f.secondScale)} - uGlowTime * ${glsl(f.flow * f.secondSpeed)} ) / uMetres;`,
    `  vec3 fallSample = max( texture2D( uMap, fallFirst ).rgb, texture2D( uMap, fallSecond ).rgb * ${glsl(f.secondShare)} );`,
    `  float fallHeat = smoothstep( ${glsl(g.mapHeatFrom)}, ${glsl(g.mapHeatTo)}, dot( fallSample, vec3( 0.2126, 0.7152, 0.0722 ) ) );`,
    `  vec3 fallColour = mix( mix( uDeep, uWarm, smoothstep( 0.0, ${glsl(g.warmTo)}, fallHeat ) ), uHot, smoothstep( ${glsl(g.mapHotFrom)}, 1.0, fallHeat ) );`,
    `  float fallRagged = ( fallNoise( vec2( vFallUv.y * ${glsl(f.edgeScale)} - uGlowTime * ${glsl(f.flow)}, vFall.x * ${glsl(f.edgeAcross)} ) ) - 0.5 ) * ${glsl(f.edgeNoise)};`,
    `  float fallSide = smoothstep( 0.0, ${glsl(f.sideFeather)}, vFall.x + fallRagged ) * smoothstep( 0.0, ${glsl(f.sideFeather)}, 1.0 - vFall.x + fallRagged );`,
    `  float fallEnds = smoothstep( 0.0, ${glsl(f.headFade)}, vFall.y ) * ( 1.0 - smoothstep( ${glsl(1 - f.footFade)}, 1.0, vFall.y ) );`,
    '  gl_FragColor = vec4( fallColour, fallSide * fallEnds );',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  #include <fog_fragment>',
    '}',
  ].join('\n');
}

function shifted(hex: string, strength: number, shift: readonly [number, number, number]): Vector3 {
  const colour: Color = new Color(hex);
  return new Vector3(colour.r * strength * shift[0], colour.g * strength * shift[1], colour.b * strength * shift[2]);
}

export function fallColours(glow: SurfaceGlow): { readonly deep: Vector3; readonly warm: Vector3; readonly hot: Vector3 } {
  const strength: number = glow.strength * LAVA_FALL.strength;
  const colour: Color = new Color(glow.color);
  const [r, g, b] = SURFACE_GLOW.hot;
  const lift: number = strength * SURFACE_GLOW.hotLift;
  return {
    deep: shifted(glow.color, strength, SURFACE_GLOW.deep),
    warm: shifted(glow.color, strength, [1, 1, 1]),
    hot: new Vector3(Math.max(colour.r, r) * lift, Math.max(colour.g, g) * lift, Math.max(colour.b, b) * lift),
  };
}

function fallMaterial(def: SurfaceDef, glow: SurfaceGlow, map: Texture): ShaderMaterial {
  const colours = fallColours(glow);
  const uniforms: Record<string, IUniform<unknown>> = UniformsUtils.merge([UniformsLib.fog, { uMap: { value: map }, uMetres: { value: def.metres }, uDeep: { value: colours.deep }, uWarm: { value: colours.warm }, uHot: { value: colours.hot } }]);
  uniforms['uGlowTime'] = GLOW_CLOCK;
  return new ShaderMaterial({ name: `fall:${def.id}`, uniforms, vertexShader: FALL_VERTEX, fragmentShader: fallFragment(), transparent: true, depthWrite: false, side: DoubleSide, fog: true });
}

export interface FallSpan {
  readonly top: number;
  readonly bottom: number;
}

export function fallSpan(zone: ZoneDef, fall: ZoneFall): FallSpan {
  const yaw: number = (fall.facingDegrees * Math.PI) / 180;
  const dx: number = Math.sin(yaw) * LAVA_FALL.probe;
  const dz: number = Math.cos(yaw) * LAVA_FALL.probe;
  return { top: liftAt(zone, fall.x - dx, fall.z - dz), bottom: liftAt(zone, fall.x + dx, fall.z + dz) };
}

export interface LavaFalls {
  readonly group: Group;
  dispose(): void;
}

export function buildLavaFalls(content: Content, zone: ZoneDef): LavaFalls {
  const group: Group = new Group();
  const meshes: Mesh<BufferGeometry, ShaderMaterial>[] = [];
  group.name = 'lava-falls';
  for (const fall of zone.falls) {
    const def: SurfaceDef | undefined = content.surfaces.get(fall.surface);
    const glow: SurfaceGlow | null = def?.glow ?? null;
    if (def === undefined || glow === null) continue;
    const span: FallSpan = fallSpan(zone, fall);
    const shape: FallMesh = fallMesh(fall, span.top, span.bottom);
    const geometry: BufferGeometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(shape.positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(shape.uvs, 2));
    geometry.setAttribute('fall', new BufferAttribute(shape.shares, 2));
    geometry.setIndex(new BufferAttribute(shape.indices, 1));
    geometry.computeBoundingSphere();
    const mesh: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(geometry, fallMaterial(def, glow, surfaceColourMap(def)));
    mesh.renderOrder = LAVA_FALL.order;
    meshes.push(mesh);
    group.add(mesh);
  }
  return {
    group,
    dispose(): void {
      group.removeFromParent();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}
