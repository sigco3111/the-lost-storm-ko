export const WAKE_STYLE = {
  soft: '--wake-soft',
  lids: '--wake-lids',
  blur: '--wake-blur',
  shadeDigits: 3,
  blurDigits: 2,
  veilId: 'vignette',
  sceneId: 'scene',
} as const;

export interface StyleTarget {
  readonly style: { setProperty(name: string, value: string): void };
}

export interface WakeLook {
  readonly soft: number;
  readonly lids: number;
  readonly blur: number;
}

export interface WakeStyle {
  show(look: WakeLook): void;
}

export const WAKE_CLEAR: WakeLook = { soft: 0, lids: 0, blur: 0 };

export function createWakeStyle(veil: StyleTarget | null, scene: StyleTarget | null): WakeStyle {
  const shown: Map<string, string> = new Map<string, string>();
  const write = (target: StyleTarget | null, name: string, value: string): void => {
    if (target === null || shown.get(name) === value) return;
    shown.set(name, value);
    target.style.setProperty(name, value);
  };
  return {
    show(look: WakeLook): void {
      write(veil, WAKE_STYLE.soft, look.soft.toFixed(WAKE_STYLE.shadeDigits));
      write(veil, WAKE_STYLE.lids, look.lids.toFixed(WAKE_STYLE.shadeDigits));
      write(scene, WAKE_STYLE.blur, `${look.blur.toFixed(WAKE_STYLE.blurDigits)}px`);
    },
  };
}
