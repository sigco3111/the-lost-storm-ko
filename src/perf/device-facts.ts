import type { WebGLRenderer } from 'three';
import { PERF_PROTOCOL } from '../backend/api.ts';
import type { PerfFactsBody } from '../backend/api.ts';
import type { GraphicsSettings } from '../settings/settings.ts';

export const DEVICE_FACTS = {
  maskedRenderer: 'WebKit WebGL',
  maskedVendor: 'WebKit',
  hundredths: 100,
} as const;

const PRINTABLE: RegExp = /[^\x20-\x7e]/g;
const BUILD_ID: RegExp = /^[A-Za-z0-9._-]{0,40}$/;

export interface GpuStrings {
  readonly vendor: string | null;
  readonly renderer: string | null;
}

export function hardwareText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text: string = value.replace(PRINTABLE, '').trim().slice(0, PERF_PROTOCOL.hardwareChars).trim();
  return text === '' ? null : text;
}

export function buildId(value: string | undefined): string {
  return value !== undefined && BUILD_ID.test(value) ? value : '';
}

export function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function unmasked(plain: string | null, masked: string, read: () => string | null): string | null {
  return plain === null || plain === masked ? read() : plain;
}

export function readGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuStrings {
  const extension = (): WEBGL_debug_renderer_info | null => gl.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: unmasked(hardwareText(gl.getParameter(gl.VENDOR)), DEVICE_FACTS.maskedVendor, (): string | null => {
      const debug: WEBGL_debug_renderer_info | null = extension();
      return debug === null ? null : hardwareText(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL));
    }),
    renderer: unmasked(hardwareText(gl.getParameter(gl.RENDERER)), DEVICE_FACTS.maskedRenderer, (): string | null => {
      const debug: WEBGL_debug_renderer_info | null = extension();
      return debug === null ? null : hardwareText(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    }),
  };
}

export function readDeviceFacts(renderer: WebGLRenderer, graphics: GraphicsSettings, touch: boolean): PerfFactsBody {
  const gpu: GpuStrings = readGpu(renderer.getContext());
  return {
    quality: graphics.quality,
    lensWater: graphics.lensWater,
    dpr: Math.round(window.devicePixelRatio * DEVICE_FACTS.hundredths) / DEVICE_FACTS.hundredths,
    viewport: [Math.round(window.innerWidth), Math.round(window.innerHeight)],
    touch,
    cores: countOrNull(navigator.hardwareConcurrency),
    memoryGb: countOrNull(Reflect.get(navigator, 'deviceMemory')),
    gpuVendor: gpu.vendor,
    gpuRenderer: gpu.renderer,
  };
}
