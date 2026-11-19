import type { IUniform, Material, Object3D, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GlimpsePiece, VoidGlimpse } from '../../sim/content/story-types.ts';
import type { Content, PropDef } from '../../sim/content/types.ts';
import { loadModel } from './character-loader.ts';
import { lookOf, withPropLook } from './prop-surface.ts';
import type { PropLook, ShaderSource } from './prop-surface.ts';
import { dressedProp } from './surfaces.ts';
import type { PropDressing } from './surfaces.ts';

export const VOID_GLIMPSE = {
  programKey: 'void-glimpse',
  wet: 0.35,
  mist: 0xe6e9ec,
  shade: { base: 0.42, sun: 0.5, sky: 0.22 },
  sun: { x: -0.45, y: 0.75, z: 0.5 },
  haze: { near: 0.38, far: 0.68, from: 10, to: 26 },
  bury: { depth: 1.6, haze: 0.18 },
  top: { from: 2.8, to: 7.4, ragged: 2.4 },
  edge: 0.6,
  mottle: { floor: 0.62, from: 0.2, to: 0.8 },
  grain: { coarse: 0.55, fine: 2.3, mix: 0.35, drift: 0.12, soft: 0.22 },
  noise: { lowKeep: 0.4, highNeed: 0.35, mottleScale: 0.5, fineOffset: 7.3, mottleOffset: 3.1 },
  faceSpread: 32,
  depthOrder: 15,
  colourOrder: 16,
} as const;

const RADIANS: number = Math.PI / 180;

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

export interface GlimpseUniforms {
  readonly [name: string]: IUniform<unknown>;
  readonly uVeilShow: IUniform<number>;
  readonly uVeilTime: IUniform<number>;
  readonly uVeilHero: IUniform<Vector2>;
  readonly uVeilGround: IUniform<number>;
  readonly uVeilMist: IUniform<Color>;
  readonly uVeilSun: IUniform<Vector3>;
  readonly uVeilShade: IUniform<Vector3>;
  readonly uVeilHaze: IUniform<Vector4>;
  readonly uVeilBury: IUniform<Vector2>;
  readonly uVeilTop: IUniform<Vector3>;
  readonly uVeilMottle: IUniform<Vector3>;
  readonly uVeilGrain: IUniform<Vector4>;
  readonly uVeilEdge: IUniform<Vector2>;
}

export function glimpseUniforms(floor: number): GlimpseUniforms {
  return {
    uVeilShow: { value: 0 },
    uVeilTime: { value: 0 },
    uVeilHero: { value: new Vector2() },
    uVeilGround: { value: floor },
    uVeilMist: { value: new Color(VOID_GLIMPSE.mist) },
    uVeilSun: { value: new Vector3(VOID_GLIMPSE.sun.x, VOID_GLIMPSE.sun.y, VOID_GLIMPSE.sun.z).normalize() },
    uVeilShade: { value: new Vector3(VOID_GLIMPSE.shade.base, VOID_GLIMPSE.shade.sun, VOID_GLIMPSE.shade.sky) },
    uVeilHaze: { value: new Vector4(VOID_GLIMPSE.haze.near, VOID_GLIMPSE.haze.far, VOID_GLIMPSE.haze.from, VOID_GLIMPSE.haze.to) },
    uVeilBury: { value: new Vector2(VOID_GLIMPSE.bury.depth, VOID_GLIMPSE.bury.haze) },
    uVeilTop: { value: new Vector3(VOID_GLIMPSE.top.from, VOID_GLIMPSE.top.to, VOID_GLIMPSE.top.ragged) },
    uVeilMottle: { value: new Vector3(VOID_GLIMPSE.mottle.floor, VOID_GLIMPSE.mottle.from, VOID_GLIMPSE.mottle.to) },
    uVeilGrain: { value: new Vector4(VOID_GLIMPSE.grain.coarse, VOID_GLIMPSE.grain.fine, VOID_GLIMPSE.grain.mix, VOID_GLIMPSE.grain.drift) },
    uVeilEdge: { value: new Vector2(VOID_GLIMPSE.edge, VOID_GLIMPSE.grain.soft) },
  };
}

const VEIL_HEAD: string = [
  'uniform float uVeilShow;',
  'uniform float uVeilTime;',
  'uniform vec2 uVeilHero;',
  'uniform float uVeilGround;',
  'uniform vec3 uVeilMist;',
  'uniform vec3 uVeilSun;',
  'uniform vec3 uVeilShade;',
  'uniform vec4 uVeilHaze;',
  'uniform vec2 uVeilBury;',
  'uniform vec3 uVeilTop;',
  'uniform vec3 uVeilMottle;',
  'uniform vec4 uVeilGrain;',
  'uniform vec2 uVeilEdge;',
  'void main() {',
].join('\n');

const VEIL_BODY: string = [
  'vec3 veilNormal = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );',
  'float veilLit = uVeilShade.x + uVeilShade.y * max( dot( veilNormal, uVeilSun ), 0.0 ) + uVeilShade.z * veilNormal.y;',
  'float veilHeight = vPropWorld.y - uVeilGround;',
  'float veilFar = smoothstep( uVeilHaze.z, uVeilHaze.w, distance( vPropWorld.xz, uVeilHero ) );',
  'float veilLow = 1.0 - smoothstep( 0.0, uVeilBury.x, veilHeight );',
  'vec2 veilAt = vec2( vPropWorld.x + vPropWorld.z, vPropWorld.y - uVeilTime * uVeilGrain.w );',
  `float veilGrain = mix( propNoise( veilAt * uVeilGrain.x ), propNoise( veilAt * uVeilGrain.y + ${glsl(VOID_GLIMPSE.noise.fineOffset)} ), uVeilGrain.z );`,
  'float veilHigh = smoothstep( uVeilTop.x, uVeilTop.y, veilHeight + ( veilGrain - 0.5 ) * uVeilTop.z );',
  'float veilHaze = clamp( mix( uVeilHaze.x, uVeilHaze.y, veilFar ) + uVeilBury.y * veilLow + ( 1.0 - uVeilHaze.y ) * veilHigh, 0.0, 1.0 );',
  'vec3 veilColour = mix( diffuseColor.rgb * veilLit, uVeilMist, veilHaze );',
  'float veilFacing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );',
  'float veilEdge = smoothstep( 0.0, uVeilEdge.x, veilFacing );',
  `float veilNeed = veilGrain * ( 1.0 - uVeilEdge.y ) + uVeilEdge.y * 0.5 + ${glsl(VOID_GLIMPSE.noise.highNeed)} * veilHigh;`,
  'float veilReveal = smoothstep( veilNeed - uVeilEdge.y, veilNeed + uVeilEdge.y, uVeilShow * ( 1.0 + 2.0 * uVeilEdge.y ) );',
  `float veilMottle = mix( uVeilMottle.x, 1.0, smoothstep( uVeilMottle.y, uVeilMottle.z, propNoise( veilAt * uVeilGrain.x * ${glsl(VOID_GLIMPSE.noise.mottleScale)} + ${glsl(VOID_GLIMPSE.noise.mottleOffset)} ) ) );`,
  `float veilAlpha = uVeilShow * veilReveal * veilEdge * veilMottle * ( 1.0 - veilHigh ) * mix( ${glsl(VOID_GLIMPSE.noise.lowKeep)}, 1.0, 1.0 - veilLow );`,
  'gl_FragColor = vec4( veilColour, clamp( veilAlpha, 0.0, 1.0 ) );',
].join('\n');

export function patchVeil(shader: ShaderSource, uniforms: GlimpseUniforms): void {
  for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', VEIL_HEAD).replace('#include <opaque_fragment>', VEIL_BODY);
}

export function veiled(material: MeshStandardMaterial, uniforms: GlimpseUniforms): MeshStandardMaterial {
  const below: MeshStandardMaterial['onBeforeCompile'] = material.onBeforeCompile.bind(material);
  const key: string = `${material.customProgramCacheKey()}+${VOID_GLIMPSE.programKey}`;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.fog = false;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    below(shader, renderer);
    patchVeil(shader, uniforms);
  };
  material.customProgramCacheKey = (): string => key;
  return material;
}

export function glimpseOrder(count: number, previous: number, roll: number): number {
  if (count <= 1) return 0;
  const step: number = 1 + Math.min(count - 2, Math.floor(roll * (count - 1)));
  return (Math.max(0, previous) + step) % count;
}

export function glimpseTurn(cameraYawDegrees: number, roll: number): number {
  return (cameraYawDegrees + (roll * 2 - 1) * VOID_GLIMPSE.faceSpread) * RADIANS;
}

export interface VoidGlimpses {
  readonly group: Group;
  readonly uniforms: GlimpseUniforms;
  readonly count: number;
  readonly ready: Promise<void>;
  show(which: number): void;
  dispose(): void;
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function ownMaterial(content: Content, def: PropDef, source: MeshStandardMaterial, dressing: PropDressing, uniforms: GlimpseUniforms): MeshStandardMaterial | null {
  const made: Material = dressedProp(content, def.surfaces, source, dressing);
  if (!(made instanceof MeshStandardMaterial)) return null;
  const look: PropLook | undefined = lookOf(made);
  const own: MeshStandardMaterial = look === undefined ? made.clone() : withPropLook(made.clone(), look);
  if (def.tint !== null) own.color.multiply(new Color(def.tint));
  return veiled(own, uniforms);
}

function placePiece(gltf: GLTF, def: PropDef, piece: GlimpsePiece, build: (geometry: BufferGeometry, source: MeshStandardMaterial) => readonly Mesh[]): Group {
  const holder: Group = new Group();
  holder.position.set(piece.x, 0, piece.z);
  holder.rotation.y = piece.rotationDegrees * RADIANS;
  holder.scale.setScalar(def.scale * piece.scale);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const geometry: unknown = node.geometry;
    const source: unknown = node.material;
    if (!isGeometry(geometry) || !(source instanceof MeshStandardMaterial)) return;
    for (const mesh of build(geometry, source)) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(node.matrixWorld);
      mesh.frustumCulled = false;
      holder.add(mesh);
    }
  });
  return holder;
}

async function showPiece(loader: GLTFLoader, def: PropDef, piece: GlimpsePiece, set: Group, build: (geometry: BufferGeometry, source: MeshStandardMaterial) => readonly Mesh[]): Promise<void> {
  const gltf: GLTF | null = await loadModel(loader, def.model).catch((): null => null);
  if (gltf !== null) set.add(placePiece(gltf, def, piece, build));
}

export function createVoidGlimpses(loader: GLTFLoader, content: Content, glimpses: readonly VoidGlimpse[], floor: number): VoidGlimpses {
  const group: Group = new Group();
  group.visible = false;
  const uniforms: GlimpseUniforms = glimpseUniforms(floor);
  const dressing: PropDressing = { wet: VOID_GLIMPSE.wet, ground: floor };
  const depthOnly: MeshBasicMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
  const owned: MeshStandardMaterial[] = [];
  const sets: Group[] = glimpses.map((): Group => {
    const set: Group = new Group();
    set.visible = false;
    group.add(set);
    return set;
  });
  const build = (def: PropDef): ((geometry: BufferGeometry, source: MeshStandardMaterial) => readonly Mesh[]) => (geometry: BufferGeometry, source: MeshStandardMaterial): readonly Mesh[] => {
    const material: MeshStandardMaterial | null = ownMaterial(content, def, source, dressing, uniforms);
    if (material === null) return [];
    owned.push(material);
    const depth: Mesh = new Mesh(geometry, depthOnly);
    depth.renderOrder = VOID_GLIMPSE.depthOrder;
    const colour: Mesh = new Mesh(geometry, material);
    colour.renderOrder = VOID_GLIMPSE.colourOrder;
    return [depth, colour];
  };
  const loading: Promise<void>[] = glimpses.flatMap((glimpse: VoidGlimpse, index: number): Promise<void>[] => {
    const set: Group | undefined = sets[index];
    if (set === undefined) return [];
    return glimpse.pieces.flatMap((piece: GlimpsePiece): Promise<void>[] => {
      const def: PropDef | undefined = content.props.get(piece.prop);
      return def === undefined ? [] : [showPiece(loader, def, piece, set, build(def))];
    });
  });
  return {
    group,
    uniforms,
    count: sets.length,
    ready: Promise.all(loading).then((): void => undefined),
    show(which: number): void {
      sets.forEach((set: Group, index: number): void => {
        set.visible = index === which;
      });
    },
    dispose(): void {
      group.removeFromParent();
      depthOnly.dispose();
      for (const material of owned) material.dispose();
    },
  };
}
