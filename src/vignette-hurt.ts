export const VIGNETTE_HURT = {
  property: '--hurt',
  shownAttribute: 'data-hurt',
  digits: 3,
} as const;

export interface HurtTarget {
  readonly style: { setProperty(name: string, value: string): void };
  toggleAttribute(name: string, force: boolean): boolean;
}

export interface HurtVignette {
  show(level: number): void;
}

export function hurtText(level: number): string {
  return Math.max(0, level).toFixed(VIGNETTE_HURT.digits);
}

export function createHurtVignette(target: HurtTarget): HurtVignette {
  const none: string = hurtText(0);
  let shown: string | null = null;
  return {
    show(level: number): void {
      const value: string = hurtText(level);
      if (value === shown) return;
      shown = value;
      target.style.setProperty(VIGNETTE_HURT.property, value);
      target.toggleAttribute(VIGNETTE_HURT.shownAttribute, value !== none);
    },
  };
}
