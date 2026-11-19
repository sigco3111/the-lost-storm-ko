export const TEAR_LOOK = {
  tearSplit: 0.032,
  tearSlip: 0.05,
  tearDensity: 0.65,
  tearStrength: 1,
  tearBlocks: 0.55,
  hudSplitPixels: 6,
  hudTearPixels: 46,
  portalWhite: 0.45,
  portalGentleWhite: 0.35,
} as const;

export interface TearLook {
  readonly split: number;
  readonly slip: number;
  readonly density: number;
  readonly tear: number;
  readonly blocks: number;
  readonly white: number;
  readonly banded: boolean;
}

export interface HudTear {
  readonly split: number;
  readonly tear: number;
}

export const CALM_LOOK: TearLook = { split: 0, slip: 0, density: 0, tear: 0, blocks: 0, white: 0, banded: true };

export function portalTear(gentle: boolean): TearLook {
  return gentle ? { ...CALM_LOOK, white: TEAR_LOOK.portalGentleWhite, banded: false } : { split: TEAR_LOOK.tearSplit, slip: TEAR_LOOK.tearSlip, density: TEAR_LOOK.tearDensity, tear: TEAR_LOOK.tearStrength, blocks: TEAR_LOOK.tearBlocks, white: TEAR_LOOK.portalWhite, banded: true };
}

export function hudTear(look: TearLook): HudTear {
  return { split: (look.split / TEAR_LOOK.tearSplit) * TEAR_LOOK.hudSplitPixels, tear: Math.min(1, look.tear + look.slip / TEAR_LOOK.tearSlip * 0.3) * TEAR_LOOK.hudTearPixels };
}
