import type { FlaskResource } from '../../sim/content/flasks.ts';
import { el, pulseClass, setText } from './dom.ts';
import type { FlaskCue, FlaskGauge, FlaskReading } from './flask-gauge.ts';
import { flaskCue, flaskGauge, flaskTicks, sameGauge } from './flask-gauge.ts';
import type { FlaskArt, FlaskLayer } from './flask-glass.ts';
import { buildFlaskArt, liquidTop } from './flask-glass.ts';

const VESSEL = {
  scale: 6,
  refusedMs: 220,
  percent: 100,
  markGlyph: '!',
  markWords: ', 관리인 상인에게 강화 가능',
} as const;

interface PreparedArt {
  readonly art: FlaskArt;
  readonly mask: string;
}

export interface FlaskVessel {
  readonly root: HTMLElement;
  paint(reading: FlaskReading): FlaskCue;
  setKey(text: string, animate: boolean): void;
  setMark(on: boolean): void;
  refuse(): void;
}

const prepared: Map<string, PreparedArt> = new Map<string, PreparedArt>();

function drawn(layer: FlaskLayer, className: string, parent: HTMLElement): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = el('canvas', className, parent);
  canvas.width = layer.width;
  canvas.height = layer.height;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.getContext('2d')?.putImageData(new ImageData(layer.data, layer.width, layer.height), 0, 0);
  return canvas;
}

function maskOf(layer: FlaskLayer): string {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = layer.width;
  canvas.height = layer.height;
  canvas.getContext('2d')?.putImageData(new ImageData(layer.data, layer.width, layer.height), 0, 0);
  return `url(${canvas.toDataURL('image/png')})`;
}

function artKey(resource: FlaskResource, reading: FlaskReading): string {
  return `${resource}|${flaskTicks(reading.maxCharges, reading.chargesPerUse).join(',')}`;
}

function artFor(resource: FlaskResource, reading: FlaskReading): PreparedArt {
  const ticks: readonly number[] = flaskTicks(reading.maxCharges, reading.chargesPerUse);
  const key: string = artKey(resource, reading);
  const known: PreparedArt | undefined = prepared.get(key);
  if (known !== undefined) return known;
  const art: FlaskArt = buildFlaskArt(resource, ticks, VESSEL.scale);
  const made: PreparedArt = { art, mask: maskOf(art.inner) };
  prepared.set(key, made);
  return made;
}

function describe(resource: FlaskResource, gauge: FlaskGauge, marked: boolean): string {
  return `${resource === 'life' ? '생명력' : '마나'} 약병, ${gauge.maxUses}회 중 ${gauge.uses}회${marked ? VESSEL.markWords : ''}`;
}

interface Drawn {
  readonly key: string;
  readonly art: FlaskArt;
  readonly liquid: HTMLCanvasElement;
  readonly surface: HTMLCanvasElement;
}

function drawArt(stage: HTMLElement, resource: FlaskResource, reading: FlaskReading): Drawn {
  const { art, mask } = artFor(resource, reading);
  stage.replaceChildren();
  drawn(art.body, 'fv-layer fv-body', stage);
  const fluid: HTMLDivElement = el('div', 'fv-fluid', stage);
  fluid.style.setProperty('mask-image', mask);
  fluid.style.setProperty('-webkit-mask-image', mask);
  const liquid: HTMLCanvasElement = drawn(art.liquid, 'fv-layer fv-liquid', fluid);
  const surface: HTMLCanvasElement = drawn(art.surface, 'fv-surface', fluid);
  surface.style.height = `${(art.surfaceHeight / art.height) * VESSEL.percent}%`;
  drawn(art.gloss, 'fv-layer fv-gloss', stage);
  drawn(art.stopper, 'fv-layer fv-stopper', stage);
  return { key: artKey(resource, reading), art, liquid, surface };
}

export function createVessel(parent: HTMLElement, resource: FlaskResource, keyed: boolean, first: FlaskReading): FlaskVessel {
  const root: HTMLDivElement = el('div', `flask-vessel ${resource}`, parent);
  root.setAttribute('role', 'img');
  const stage: HTMLDivElement = el('div', 'fv-art', root);
  let art: Drawn = drawArt(stage, resource, first);
  const mark: HTMLElement = el('em', 'fv-mark', root);
  mark.textContent = VESSEL.markGlyph;
  mark.setAttribute('aria-hidden', 'true');
  const key: HTMLSpanElement | null = keyed ? el('span', 'fv-key', root) : null;
  el('i', 'fv-bar', root);
  root.classList.toggle('fv-keyed', keyed);
  let shown: FlaskGauge | null = null;
  let last: FlaskReading | null = null;
  let marked: boolean = false;

  const place = (level: number): void => {
    art.liquid.style.clipPath = `inset(${((liquidTop(level) / art.art.height) * VESSEL.percent).toFixed(3)}% 0 0 0)`;
    art.surface.style.translate = `0 ${(((liquidTop(level) + art.art.lens) / art.art.surfaceHeight - 0.5) * VESSEL.percent).toFixed(3)}%`;
    art.surface.style.opacity = level <= 0 ? '0' : '1';
  };

  return {
    root,
    paint(reading: FlaskReading): FlaskCue {
      const cue: FlaskCue = flaskCue(last, reading);
      last = reading;
      const gauge: FlaskGauge = flaskGauge(reading);
      if (art.key !== artKey(resource, reading)) {
        art = drawArt(stage, resource, reading);
        shown = null;
      }
      if (sameGauge(shown, gauge)) return cue;
      if (shown === null || shown.level !== gauge.level) place(gauge.level);
      root.classList.toggle('fv-empty', gauge.empty);
      root.classList.toggle('fv-pouring', gauge.restoring);
      root.setAttribute('aria-label', describe(resource, gauge, marked));
      shown = gauge;
      return cue;
    },
    setKey(text: string, animate: boolean): void {
      if (key !== null) setText(key, text, animate);
    },
    setMark(on: boolean): void {
      if (on === marked) return;
      marked = on;
      root.classList.toggle('fv-upgrade', on);
      if (shown !== null) root.setAttribute('aria-label', describe(resource, shown, marked));
    },
    refuse(): void {
      pulseClass(root, 'fv-refused', VESSEL.refusedMs);
    },
  };
}
