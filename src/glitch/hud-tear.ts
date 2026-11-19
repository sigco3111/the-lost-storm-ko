import type { HudTear } from './tear-look.ts';

export const HUD_TEAR = {
  filterId: 'hud-tear',
  onClass: 'hud-torn',
  bandRows: 96,
  bandWidth: 4,
  stillShare: 0.55,
  rate: 20,
  levels: 9,
  svgNs: 'http://www.w3.org/2000/svg',
} as const;

export interface HudTearView {
  show(tear: HudTear, time: number): void;
  calm(): void;
}

export function bandLevels(random: () => number): number[] {
  const levels: number[] = [];
  let row: number = 0;
  while (row < HUD_TEAR.bandRows * 2) {
    const height: number = 1 + Math.floor(random() * 6);
    const level: number = random() < HUD_TEAR.stillShare ? 0.5 : Math.floor(random() * HUD_TEAR.levels) / (HUD_TEAR.levels - 1);
    for (let index: number = 0; index < height && row < HUD_TEAR.bandRows * 2; index += 1, row += 1) levels.push(level);
  }
  return levels;
}

function bandImage(levels: readonly number[]): string {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = HUD_TEAR.bandWidth;
  canvas.height = levels.length;
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (context === null) return '';
  levels.forEach((level: number, row: number): void => {
    context.fillStyle = `rgb(${Math.round(level * 255)}, 128, 128)`;
    context.fillRect(0, row, HUD_TEAR.bandWidth, 1);
  });
  return canvas.toDataURL();
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, parent: Element, attributes: Readonly<Record<string, string>>): SVGElementTagNameMap[K] {
  const node: SVGElementTagNameMap[K] = document.createElementNS(HUD_TEAR.svgNs, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent.append(node);
  return node;
}

export function createHudTear(host: HTMLElement): HudTearView {
  const filterRoot: SVGSVGElement = svg('svg', host, { width: '0', height: '0', 'aria-hidden': 'true' });
  filterRoot.style.position = 'absolute';
  const defs: SVGDefsElement = svg('defs', filterRoot, {});
  const filter: SVGFilterElement = svg('filter', defs, { id: HUD_TEAR.filterId, x: '-10%', y: '0', width: '120%', height: '100%', 'color-interpolation-filters': 'sRGB' });
  const image: SVGFEImageElement = svg('feImage', filter, { href: bandImage(bandLevels(Math.random)), x: '0%', y: '0%', width: '100%', height: '200%', preserveAspectRatio: 'none', result: 'bands' });
  const displace: SVGFEDisplacementMapElement = svg('feDisplacementMap', filter, { in: 'SourceGraphic', in2: 'bands', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G', result: 'torn' });
  svg('feColorMatrix', filter, { in: 'torn', type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'red' });
  const red: SVGFEOffsetElement = svg('feOffset', filter, { in: 'red', dx: '0', dy: '0', result: 'redShift' });
  svg('feColorMatrix', filter, { in: 'torn', type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'cyan' });
  const cyan: SVGFEOffsetElement = svg('feOffset', filter, { in: 'cyan', dx: '0', dy: '0', result: 'cyanShift' });
  svg('feBlend', filter, { in: 'redShift', in2: 'cyanShift', mode: 'screen' });
  let on: boolean = false;
  let tick: number = -1;
  return {
    show(tear: HudTear, time: number): void {
      if (tear.tear <= 0.01 && tear.split <= 0.01) {
        this.calm();
        return;
      }
      if (!on) {
        on = true;
        document.body.classList.add(HUD_TEAR.onClass);
      }
      const now: number = Math.floor(time * HUD_TEAR.rate);
      if (now !== tick) {
        tick = now;
        image.setAttribute('y', `${-Math.floor(Math.random() * 100)}%`);
      }
      displace.setAttribute('scale', tear.tear.toFixed(1));
      red.setAttribute('dx', tear.split.toFixed(1));
      cyan.setAttribute('dx', (-tear.split).toFixed(1));
    },
    calm(): void {
      if (!on) return;
      on = false;
      document.body.classList.remove(HUD_TEAR.onClass);
      displace.setAttribute('scale', '0');
    },
  };
}
