import type { FlaskResource } from '../../sim/content/flasks.ts';

export type Rgb = readonly [number, number, number];

export interface FlaskLayer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

export interface FlaskArt {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly full: number;
  readonly empty: number;
  readonly lens: number;
  readonly surfaceHeight: number;
  readonly body: FlaskLayer;
  readonly liquid: FlaskLayer;
  readonly surface: FlaskLayer;
  readonly gloss: FlaskLayer;
  readonly stopper: FlaskLayer;
  readonly inner: FlaskLayer;
}

export const VIAL = {
  width: 26,
  height: 66,
  lipTop: 9,
  lipEnd: 11.4,
  lipRadius: 5.2,
  neckRadius: 4,
  shoulderStart: 12,
  shoulderEnd: 28,
  bodyRadius: 8.6,
  cornerStart: 60,
  cornerRadius: 4.2,
  bottom: 64,
  wall: 1.5,
  floor: 1.8,
  full: 27,
  slopeStep: 0.3,
} as const;

export const CORK = {
  top: 2.2,
  bottom: 10,
  topRadius: 4.4,
  bottomRadius: 4,
  shade: [150, 114, 78],
  lit: [205, 168, 120],
  litDepth: 1.6,
  litShare: 0.35,
  grainBase: 0.82,
  grainCoarse: 0.3,
  grainFine: 0.12,
  coarseFrequency: 2.6,
  fineFrequency: 9,
  pitFrequency: 5.5,
  pitThreshold: 0.84,
  pitDarkness: 0.7,
  ambient: 0.5,
  diffuse: 0.62,
} as const satisfies Readonly<Record<string, number | Rgb>>;

export const SHADE = {
  edgeTint: [10, 14, 20],
  edgeBase: 0.22,
  edgeGain: 0.5,
  edgePower: 1.6,
  fresnelBase: 0.07,
  fresnelGain: 0.9,
  fresnelPower: 3,
  rimGain: 0.34,
  rimPower: 2.2,
  rimShare: 0.55,
  glossLow: [190, 206, 228],
  glossHigh: [245, 249, 255],
  glossTint: 0.2,
  light: [-0.55, -0.45, 0.7],
  slopeLimit: 3,
} as const satisfies Readonly<Record<string, number | Rgb | readonly number[]>>;

export const WINDOWS = {
  keyLeft: -0.86,
  keyRight: -0.34,
  keyTop: -0.95,
  keyBottom: 0.4,
  keySoftX: 0.1,
  keySoftY: 0.22,
  keyPower: 3.4,
  fillLeft: 0.5,
  fillRight: 0.7,
  fillTop: -0.5,
  fillBottom: 0.75,
  fillSoftX: 0.08,
  fillSoftY: 0.18,
  fillPower: 1.6,
  skyStart: -0.55,
  skyEnd: -0.9,
  skyWidth: 0.7,
  skySoft: 0.3,
  skyPower: 1.2,
  ambient: 0.1,
} as const;

export const LIQUID: Readonly<Record<FlaskResource, { readonly light: Rgb; readonly deep: Rgb; readonly glint: Rgb }>> = {
  life: { light: [196, 52, 62], deep: [66, 10, 20], glint: [255, 150, 140] },
  mana: { light: [96, 138, 206], deep: [22, 36, 70], glint: [170, 205, 255] },
};

export const FLUID = {
  alpha: 0.96,
  depthFade: 0.72,
  radialBase: 0.62,
  radialGain: 0.62,
  radialPower: 1.3,
  brightness: 1.05,
  causticFrom: 0.35,
  causticCenter: 0.52,
  causticWidth: 0.3,
  causticDepth: 0.82,
  causticDepthWidth: 0.2,
  causticGain: 0.55,
  sheenCenter: -0.58,
  sheenWidth: 0.12,
  sheenGain: 0.16,
  sheenFade: 0.5,
} as const;

export const SURFACE = {
  height: 8,
  lens: 1.15,
  reach: 0.46,
  fill: 0.34,
  fillSoft: 6,
  ring: 0.6,
  ringWidth: 4.2,
  backShare: 0.35,
  mixGain: 0.7,
  mixBase: 0.2,
  mixFill: 0.55,
  mixRing: 0.8,
  white: [255, 235, 235],
  hideSpeed: 10,
} as const satisfies Readonly<Record<string, number | Rgb>>;

export const TICKS = {
  from: 0.38,
  to: 0.7,
  toTop: 0.78,
  thickness: 0.5,
  alpha: 0.64,
  white: [236, 242, 250],
  fadeFrom: 0.6,
  minimumRadius: 2,
} as const satisfies Readonly<Record<string, number | Rgb>>;

type Profile = (y: number) => number;

interface Normal {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function clamp(value: number, low: number = 0, high: number = 1): number {
  return Math.min(high, Math.max(low, value));
}

function smooth(a: number, b: number, value: number): number {
  const t: number = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function band(value: number, low: number, high: number, soft: number): number {
  return smooth(low - soft, low + soft, value) - smooth(high - soft, high + soft, value);
}

function hash(x: number, y: number): number {
  const s: number = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number): number {
  const ix: number = Math.floor(x);
  const iy: number = Math.floor(y);
  const fx: number = x - ix;
  const fy: number = y - iy;
  const sx: number = fx * fx * (3 - 2 * fx);
  const sy: number = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), sx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
}

export function vialRadius(y: number): number {
  if (y < VIAL.lipTop || y > VIAL.bottom) return 0;
  if (y < VIAL.lipEnd) return mix(VIAL.lipRadius, VIAL.neckRadius, smooth(VIAL.lipTop, VIAL.lipEnd, y));
  if (y < VIAL.shoulderEnd) return mix(VIAL.neckRadius, VIAL.bodyRadius, Math.sin(smooth(VIAL.shoulderStart, VIAL.shoulderEnd, y) * Math.PI * 0.5));
  if (y < VIAL.cornerStart) return VIAL.bodyRadius;
  const down: number = y - VIAL.cornerStart;
  return VIAL.bodyRadius - VIAL.cornerRadius + Math.sqrt(Math.max(0, VIAL.cornerRadius * VIAL.cornerRadius - down * down));
}

export function vialInnerRadius(y: number): number {
  if (y > VIAL.bottom - VIAL.floor) return 0;
  return Math.max(0, vialRadius(y) - VIAL.wall);
}

export function liquidEmpty(): number {
  return VIAL.bottom - VIAL.floor;
}

export function liquidLine(level: number): number {
  return mix(liquidEmpty(), VIAL.full, clamp(level));
}

export function liquidTop(level: number): number {
  return liquidLine(level) + SURFACE.lens * (1 - 2 * Math.min(1, clamp(level) * SURFACE.hideSpeed));
}

function corkRadius(y: number): number {
  return mix(CORK.topRadius, CORK.bottomRadius, smooth(CORK.top, CORK.bottom, y));
}

function slopeOf(profile: Profile, y: number): number {
  return (profile(y + VIAL.slopeStep) - profile(y - VIAL.slopeStep)) / (2 * VIAL.slopeStep);
}

function blank(width: number, height: number): FlaskLayer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function put(layer: FlaskLayer, px: number, py: number, color: Rgb, alpha: number): void {
  const index: number = (py * layer.width + px) * 4;
  layer.data[index] = color[0];
  layer.data[index + 1] = color[1];
  layer.data[index + 2] = color[2];
  layer.data[index + 3] = Math.round(clamp(alpha) * 255);
}

function rgb(r: number, g: number, b: number): Rgb {
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function environment(rx: number, ry: number): number {
  const key: number = band(rx, WINDOWS.keyLeft, WINDOWS.keyRight, WINDOWS.keySoftX) * band(ry, WINDOWS.keyTop, WINDOWS.keyBottom, WINDOWS.keySoftY) * WINDOWS.keyPower;
  const fill: number = band(rx, WINDOWS.fillLeft, WINDOWS.fillRight, WINDOWS.fillSoftX) * band(ry, WINDOWS.fillTop, WINDOWS.fillBottom, WINDOWS.fillSoftY) * WINDOWS.fillPower;
  const sky: number = smooth(WINDOWS.skyStart, WINDOWS.skyEnd, ry) * band(rx, -WINDOWS.skyWidth, WINDOWS.skyWidth, WINDOWS.skySoft) * WINDOWS.skyPower;
  return key + fill + sky + WINDOWS.ambient;
}

function normalOf(u: number, slope: number): Normal {
  const z: number = Math.sqrt(Math.max(0, 1 - u * u));
  const y: number = clamp(-slope, -SHADE.slopeLimit, SHADE.slopeLimit);
  const length: number = Math.max(Math.hypot(u, y, z), Number.EPSILON);
  return { x: u / length, y: y / length, z: z / length };
}

function reflection(n: Normal): { readonly x: number; readonly y: number } {
  return { x: 2 * n.z * n.x, y: 2 * n.z * n.y };
}

function coverage(radius: number, dx: number, scale: number, y: number, top: number, bottom: number): number {
  return clamp(radius * scale - Math.abs(dx) * scale + 0.5) * clamp((y - top) * scale + 0.5) * clamp((bottom - y) * scale + 0.5);
}

function paintGlass(art: Readonly<Record<'body' | 'gloss' | 'inner' | 'liquid', FlaskLayer>>, resource: FlaskResource, scale: number): void {
  const paint = LIQUID[resource];
  const cx: number = (VIAL.width * scale) / 2;
  const empty: number = liquidEmpty();
  for (let py = 0; py < art.body.height; py++) {
    const y: number = (py + 0.5) / scale;
    const outer: number = vialRadius(y);
    const inner: number = vialInnerRadius(y);
    const slope: number = slopeOf(vialRadius, y);
    const slopeInner: number = slopeOf(vialInnerRadius, y);
    for (let px = 0; px < art.body.width; px++) {
      const dx: number = (px + 0.5 - cx) / scale;
      const cover: number = coverage(outer, dx, scale, y, VIAL.lipTop, VIAL.bottom);
      if (cover > 0 && outer > 0.2) {
        const n: Normal = normalOf(clamp(dx / outer, -1, 1), slope);
        const r = reflection(n);
        const lit: number = environment(r.x, r.y);
        const fresnel: number = SHADE.fresnelBase + SHADE.fresnelGain * Math.pow(1 - n.z, SHADE.fresnelPower);
        const rim: number = Math.pow(1 - n.z, SHADE.rimPower) * SHADE.rimGain;
        put(art.body, px, py, SHADE.edgeTint, cover * (SHADE.edgeBase + SHADE.edgeGain * Math.pow(1 - n.z, SHADE.edgePower)));
        put(art.gloss, px, py, lerpRgb(SHADE.glossLow, SHADE.glossHigh, clamp(lit * SHADE.glossTint)), clamp(lit * fresnel + rim * SHADE.rimShare) * cover);
        put(art.inner, px, py, [255, 255, 255], 1);
      }
      const coverInner: number = inner > 0.3 ? coverage(inner, dx, scale, y, VIAL.full - SURFACE.lens, empty) : 0;
      if (coverInner <= 0) continue;
      const ui: number = clamp(dx / inner, -1, 1);
      const ni: Normal = normalOf(ui, slopeInner);
      const depth: number = clamp((y - VIAL.full) / (empty - VIAL.full));
      const radial: number = FLUID.radialBase + FLUID.radialGain * Math.pow(1 - ni.z, FLUID.radialPower);
      const k: number = clamp((1 - depth * FLUID.depthFade) * radial * FLUID.brightness);
      const caustic: number = Math.exp(-Math.pow((ui - FLUID.causticCenter) / FLUID.causticWidth, 2)) * Math.exp(-Math.pow((depth - FLUID.causticDepth) / FLUID.causticDepthWidth, 2)) * FLUID.causticGain * smooth(FLUID.causticFrom, 1, depth);
      const sheen: number = Math.exp(-Math.pow((ui - FLUID.sheenCenter) / FLUID.sheenWidth, 2)) * FLUID.sheenGain * (1 - depth * FLUID.sheenFade);
      put(art.liquid, px, py, lerpRgb(lerpRgb(paint.deep, paint.light, k), paint.glint, caustic + sheen), coverInner * FLUID.alpha);
    }
  }
}

function paintSurface(layer: FlaskLayer, resource: FlaskResource, scale: number): void {
  const paint = LIQUID[resource];
  const cx: number = (VIAL.width * scale) / 2;
  const centre: number = layer.height / 2;
  const reach: number = VIAL.width * SURFACE.reach;
  for (let py = 0; py < layer.height; py++) {
    for (let px = 0; px < layer.width; px++) {
      const dx: number = (px + 0.5 - cx) / scale;
      const dy: number = (py + 0.5 - centre) / scale;
      const e: number = (dx * dx) / (reach * reach) + (dy * dy) / (SURFACE.lens * SURFACE.lens);
      const inside: number = clamp((1 - e) * SURFACE.fillSoft);
      const ring: number = Math.exp(-Math.pow((Math.sqrt(e) - 1) * SURFACE.ringWidth, 2));
      const front: number = dy > 0 ? 1 : SURFACE.backShare;
      const alpha: number = clamp(inside * SURFACE.fill + ring * front * SURFACE.ring);
      if (alpha <= 0.003) continue;
      const shine: number = (SURFACE.mixFill * inside + SURFACE.mixRing * ring * front) * SURFACE.mixGain + SURFACE.mixBase;
      put(layer, px, py, lerpRgb(paint.light, SURFACE.white, clamp(shine)), alpha);
    }
  }
}

function paintTicks(gloss: FlaskLayer, ticks: readonly number[], scale: number): void {
  const cx: number = (VIAL.width * scale) / 2;
  const empty: number = liquidEmpty();
  const rows: number = Math.max(1, Math.round(scale * TICKS.thickness));
  for (const tick of ticks) {
    const y: number = mix(empty, VIAL.full, tick);
    const radius: number = vialInnerRadius(y);
    if (radius < TICKS.minimumRadius) continue;
    const from: number = Math.round(cx + radius * TICKS.from * scale);
    const to: number = Math.round(cx + radius * (tick >= 0.99 ? TICKS.toTop : TICKS.to) * scale);
    const top: number = Math.round(y * scale);
    for (let px = from; px < to; px++) {
      const fade: number = 1 - smooth(TICKS.fadeFrom, 1, (px - from) / Math.max(1, to - from));
      for (let row = top; row < top + rows; row++) {
        if (row < 0 || row >= gloss.height) continue;
        const index: number = (row * gloss.width + px) * 4;
        const prior: number = (gloss.data[index + 3] ?? 0) / 255;
        gloss.data[index] = TICKS.white[0];
        gloss.data[index + 1] = TICKS.white[1];
        gloss.data[index + 2] = TICKS.white[2];
        gloss.data[index + 3] = Math.round(clamp(prior + TICKS.alpha * fade) * 255);
      }
    }
  }
}

function paintCork(layer: FlaskLayer, scale: number): void {
  const cx: number = (VIAL.width * scale) / 2;
  const light: Normal = { x: SHADE.light[0], y: SHADE.light[1], z: SHADE.light[2] };
  for (let py = 0; py < layer.height; py++) {
    const y: number = (py + 0.5) / scale;
    if (y < CORK.top || y > CORK.bottom) continue;
    const radius: number = corkRadius(y);
    const slope: number = slopeOf(corkRadius, y);
    for (let px = 0; px < layer.width; px++) {
      const dx: number = (px + 0.5 - cx) / scale;
      const cover: number = coverage(radius, dx, scale, y, CORK.top, CORK.bottom);
      if (cover <= 0) continue;
      const n: Normal = normalOf(clamp(dx / radius, -1, 1), slope);
      const diffuse: number = CORK.ambient + CORK.diffuse * clamp(light.x * n.x + light.y * n.y + light.z * n.z);
      const u: number = px / scale;
      const v: number = py / scale;
      const grain: number = CORK.grainBase + CORK.grainCoarse * noise(u * CORK.coarseFrequency, v * CORK.coarseFrequency) + CORK.grainFine * noise(u * CORK.fineFrequency, v * CORK.fineFrequency);
      const pit: number = noise(u * CORK.pitFrequency + 7, v * CORK.pitFrequency + 3) > CORK.pitThreshold ? CORK.pitDarkness : 1;
      const top: number = smooth(CORK.top + CORK.litDepth, CORK.top, y) * CORK.litShare;
      const base: Rgb = lerpRgb(CORK.shade, CORK.lit, top);
      const scaled: number = diffuse * grain * pit;
      put(layer, px, py, rgb(base[0] * scaled, base[1] * scaled, base[2] * scaled), cover);
    }
  }
}

export function buildFlaskArt(resource: FlaskResource, ticks: readonly number[], scale: number): FlaskArt {
  const width: number = Math.round(VIAL.width * scale);
  const height: number = Math.round(VIAL.height * scale);
  const glass = { body: blank(width, height), gloss: blank(width, height), inner: blank(width, height), liquid: blank(width, height) };
  const surface: FlaskLayer = blank(width, Math.round(SURFACE.height * scale));
  const stopper: FlaskLayer = blank(width, height);
  paintGlass(glass, resource, scale);
  paintSurface(surface, resource, scale);
  paintTicks(glass.gloss, ticks, scale);
  paintCork(stopper, scale);
  return { width: VIAL.width, height: VIAL.height, scale, full: VIAL.full, empty: liquidEmpty(), lens: SURFACE.lens, surfaceHeight: SURFACE.height, ...glass, surface, stopper };
}
