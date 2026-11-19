import type { IUniform, MeshStandardMaterial, Object3D, Quaternion, Vector3, WebGLProgramParametersWithUniforms } from 'three';
import type { MarkerPiece } from '../../sim/content/marker-types.ts';

export const MARKER_AWAKEN = {
  seconds: 2.4,
  pieceStart: 0.02,
  pieceStagger: 0.14,
  pieceSpan: 0.4,
  arc: 0.55,
  seat: 1.2,
  kick: 0.28,
  climbStart: 0.42,
  climbEnd: 0.86,
  climbFeather: 0.45,
  climbFloor: -0.2,
  climbOpen: 10000,
  glowStart: 0.42,
  glowEnd: 0.92,
  crystalStart: 0.58,
  crystalEnd: 0.96,
  crystalFloor: 0.001,
  pulseStart: 0.4,
  pulseEnd: 1,
  pulseLight: 2.2,
  pulseRise: 0.2,
} as const;

export type WakeState = { readonly type: 'asleep' } | { readonly type: 'waking'; readonly elapsed: number } | { readonly type: 'awake' };

export interface WakePose {
  readonly pieces: readonly number[];
  readonly climb: number;
  readonly glow: number;
  readonly crystal: number;
  readonly pulse: number | null;
}

export interface WakePiece {
  readonly index: number;
  readonly node: Object3D;
  readonly restAt: Vector3;
  readonly restTurn: Quaternion;
  readonly fallenAt: Vector3;
  readonly fallenTurn: Quaternion;
}

export interface ClimbUniforms {
  readonly uClimb: IUniform<number>;
  readonly uClimbFeather: IUniform<number>;
}

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function pulseFlare(pulse: number | null): number {
  if (pulse === null) return 0;
  return smooth(pulse / MARKER_AWAKEN.pulseRise) * (1 - smooth((pulse - MARKER_AWAKEN.pulseRise) / (1 - MARKER_AWAKEN.pulseRise)));
}

function phase(share: number, start: number, end: number): number {
  return smooth((share - start) / (end - start));
}

function seated(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const p: number = smooth(t) - 1;
  return 1 + (MARKER_AWAKEN.seat + 1) * p * p * p + MARKER_AWAKEN.seat * p * p;
}

export function startWake(awake: boolean): WakeState {
  return awake ? { type: 'awake' } : { type: 'asleep' };
}

export function advanceWake(state: WakeState, awake: boolean, dt: number): WakeState {
  if (!awake) return { type: 'asleep' };
  switch (state.type) {
    case 'asleep':
      return { type: 'waking', elapsed: 0 };
    case 'waking': {
      const elapsed: number = state.elapsed + dt;
      return elapsed >= MARKER_AWAKEN.seconds ? { type: 'awake' } : { type: 'waking', elapsed };
    }
    case 'awake':
      return state;
  }
  return state;
}

export function wakeShare(state: WakeState): number {
  switch (state.type) {
    case 'asleep':
      return 0;
    case 'waking':
      return Math.min(1, state.elapsed / MARKER_AWAKEN.seconds);
    case 'awake':
      return 1;
  }
  return 1;
}

export function landingShare(pieces: number): number {
  return pieces === 0 ? MARKER_AWAKEN.climbStart : MARKER_AWAKEN.pieceStart + MARKER_AWAKEN.pieceStagger * (pieces - 1) + MARKER_AWAKEN.pieceSpan;
}

export function landedBetween(before: number, after: number, pieces: number): boolean {
  if (pieces === 0) return false;
  const landing: number = landingShare(pieces);
  return before < landing && after >= landing;
}

export function wakePose(share: number, pieces: number): WakePose {
  const placed: number[] = [];
  for (let index: number = 0; index < pieces; index += 1) {
    const start: number = MARKER_AWAKEN.pieceStart + MARKER_AWAKEN.pieceStagger * index;
    placed.push(seated((share - start) / MARKER_AWAKEN.pieceSpan));
  }
  const pulsing: boolean = share > MARKER_AWAKEN.pulseStart && share < MARKER_AWAKEN.pulseEnd;
  return {
    pieces: placed,
    climb: phase(share, MARKER_AWAKEN.climbStart, MARKER_AWAKEN.climbEnd),
    glow: phase(share, MARKER_AWAKEN.glowStart, MARKER_AWAKEN.glowEnd),
    crystal: phase(share, MARKER_AWAKEN.crystalStart, MARKER_AWAKEN.crystalEnd),
    pulse: pulsing ? (share - MARKER_AWAKEN.pulseStart) / (MARKER_AWAKEN.pulseEnd - MARKER_AWAKEN.pulseStart) : null,
  };
}

export function wakePieces(scene: Object3D, pieces: readonly MarkerPiece[]): WakePiece[] {
  const found: WakePiece[] = [];
  pieces.forEach((piece: MarkerPiece, index: number): void => {
    const node: Object3D | undefined = scene.getObjectByName(piece.node);
    const fallen: Object3D | undefined = scene.getObjectByName(piece.fallen);
    if (node === undefined || fallen === undefined) return;
    found.push({ index, node, restAt: node.position.clone(), restTurn: node.quaternion.clone(), fallenAt: fallen.position.clone(), fallenTurn: fallen.quaternion.clone() });
  });
  return found;
}

export function posePiece(piece: WakePiece, placed: number): void {
  piece.node.position.lerpVectors(piece.fallenAt, piece.restAt, placed);
  piece.node.position.y += MARKER_AWAKEN.arc * Math.sin(Math.PI * Math.min(1, Math.max(0, placed)));
  piece.node.quaternion.slerpQuaternions(piece.fallenTurn, piece.restTurn, Math.min(1, Math.max(0, placed)));
}

export function climbHeight(ground: number, top: number, climb: number, awake: boolean): number {
  if (awake) return MARKER_AWAKEN.climbOpen;
  const floor: number = MARKER_AWAKEN.climbFloor - MARKER_AWAKEN.climbFeather;
  return ground + floor + (top + MARKER_AWAKEN.climbFeather * 2 - floor) * climb;
}

export function climbingGlow(material: MeshStandardMaterial, uniforms: ClimbUniforms): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    shader.uniforms['uClimb'] = uniforms.uClimb;
    shader.uniforms['uClimbFeather'] = uniforms.uClimbFeather;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vClimbHeight;').replace('#include <project_vertex>', '#include <project_vertex>\nvClimbHeight = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClimb;\nuniform float uClimbFeather;\nvarying float vClimbHeight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - smoothstep(uClimb - uClimbFeather, uClimb, vClimbHeight);');
  };
  material.customProgramCacheKey = (): string => 'marker-climb';
}
