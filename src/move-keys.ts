import type { Vec2 } from '../sim/math.ts';
import type { StopCommand, WalkCommand } from '../sim/world/types.ts';
import type { StickReading } from './mobile/touch-map.ts';
import { readStick, stickDirection, stickMove } from './mobile/touch-map.ts';

export interface MoveKeys {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface KeyWalk {
  step(keys: MoveKeys, from: Vec2): (WalkCommand | StopCommand)[];
}

const FULL_PRESS: number = 1;

function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

export function keysReading(keys: MoveKeys): StickReading {
  return readStick(axis(keys.right, keys.left), axis(keys.down, keys.up), FULL_PRESS);
}

export function keysDirection(keys: MoveKeys, yaw: number): Vec2 | null {
  return stickDirection(keysReading(keys), yaw);
}

export function createKeyWalk(yaw: number): KeyWalk {
  let moving: boolean = false;
  return {
    step(keys: MoveKeys, from: Vec2): (WalkCommand | StopCommand)[] {
      const move: WalkCommand | null = stickMove(from, keysDirection(keys, yaw), moving);
      if (move !== null) {
        moving = true;
        return [move];
      }
      if (!moving) return [];
      moving = false;
      return [{ type: 'stop' }];
    },
  };
}
