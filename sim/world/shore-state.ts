import type { Vec2 } from '../math.ts';

export interface ShoreState {
  readonly at: Vec2;
  readonly facing: Vec2;
  readonly returned: boolean;
}
