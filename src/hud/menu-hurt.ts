export const MENU_HURT = {
  holdSeconds: 1.6,
  line: '공격받고 있다.',
} as const;

export interface HurtWatch {
  readonly life: number;
  readonly hold: number;
}

export function watchHurt(previous: HurtWatch, life: number, dt: number): HurtWatch {
  if (life < previous.life) return { life, hold: MENU_HURT.holdSeconds };
  return { life, hold: Math.max(0, previous.hold - dt) };
}

export function hurtShown(watch: HurtWatch): boolean {
  return watch.hold > 0;
}
