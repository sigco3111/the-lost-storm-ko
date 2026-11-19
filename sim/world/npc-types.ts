import type { NpcDef, ZoneNpc } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Motion } from './types.ts';

export interface NpcState {
  readonly id: number;
  readonly def: NpcDef;
  readonly placement: ZoneNpc;
  readonly pos: Vec2;
  readonly homeFacing: number;
  facing: number;
  motion: Motion;
  gait: number;
  route: Vec2[];
  pace: number;
  fade: number;
}
