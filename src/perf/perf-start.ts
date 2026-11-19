import type { WebGLInfo, WebGLRenderer } from 'three';
import type { PerfEnd, PerfFactsBody, PerfWindowBody } from '../backend/api.ts';
import { createBrowserPerfClient, pagePlay } from '../backend/browser.ts';
import type { PerfClient, PerfOutcome } from '../backend/perf-api.ts';
import type { GraphicsSettings } from '../settings/settings.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { World } from '../../sim/world/types.ts';
import { buildId, readDeviceFacts } from './device-facts.ts';
import { createFrameSampler } from './frame-sampler.ts';
import type { FrameSampler, PerfEvent } from './frame-sampler.ts';
import { answered, due, emptyOutbox, queued, takeBatch } from './perf-outbox.ts';
import type { PerfHeader, PerfOutbox, Taken } from './perf-outbox.ts';

export interface PerfDeps {
  readonly serverUrl: string | undefined;
  readonly build: string | undefined;
  readonly renderer: WebGLRenderer;
  readonly world: World;
  readonly touch: boolean;
  tier(): QualityName;
  graphics(): GraphicsSettings;
  inPlay(): boolean;
}

export interface PerfReports {
  frame(now: number): void;
  beforeRender(now: number): void;
  afterRender(): void;
  note(event: PerfEvent): void;
  left(): void;
}

function nothing(): void {}

const SILENT: PerfReports = { frame: nothing, beforeRender: nothing, afterRender: nothing, note: nothing, left: nothing };

function liveMonsters(world: World): number {
  let live: number = 0;
  for (let index: number = 0; index < world.monsters.length; index += 1) if (world.monsters[index]?.alive === true) live += 1;
  return live;
}

export function startPerfReports(deps: PerfDeps): PerfReports {
  const client: PerfClient | null = createBrowserPerfClient(deps.serverUrl);
  if (client === null) return SILENT;
  const info: WebGLInfo = deps.renderer.info;
  const canvas: HTMLCanvasElement = deps.renderer.domElement;
  let box: PerfOutbox = emptyOutbox(performance.now());
  let facts: PerfFactsBody | null = null;
  let measuring: boolean = false;
  let held: boolean = false;
  const header = (): PerfHeader => ({ play: pagePlay().id, build: buildId(deps.build), device: deps.touch ? 'phone' : 'desktop', tier: deps.tier() });
  const deliver = async (taken: Taken): Promise<void> => {
    const outcome: PerfOutcome = await client.send(taken.batch.text, taken.batch.anonymous);
    box = answered(box, taken.batch, outcome, performance.now());
  };
  const pump = (final: boolean): void => {
    const now: number = performance.now();
    if (!due(box, now, final)) return;
    if (facts === null && !deps.renderer.getContext().isContextLost()) facts = readDeviceFacts(deps.renderer, deps.graphics(), deps.touch);
    const taken: Taken | null = takeBatch(box, header(), facts, now);
    if (taken === null) return;
    box = taken.box;
    void deliver(taken);
  };
  const sampler: FrameSampler = createFrameSampler((window: PerfWindowBody): void => {
    box = queued(box, window);
  });
  const finish = (reason: PerfEnd): void => {
    sampler.end(performance.now(), reason);
    pump(reason !== 'left');
  };
  document.addEventListener('visibilitychange', (): void => {
    if (!document.hidden) return;
    sampler.hidden();
    finish('hidden');
  });
  window.addEventListener('pagehide', (): void => finish('page'));
  canvas.addEventListener('webglcontextlost', (): void => sampler.note('lost'));
  canvas.addEventListener('webglcontextrestored', (): void => sampler.note('restored'));
  return {
    frame(now: number): void {
      sampler.frame(now, deps.inPlay() && document.visibilityState === 'visible', deps.world.zone.id, liveMonsters(deps.world));
      if (box.queue.length > 0) pump(false);
    },
    beforeRender(now: number): void {
      if (held) info.autoReset = true;
      held = false;
      measuring = info.autoReset && sampler.wantsMeasure(now);
      if (!measuring) return;
      held = true;
      info.autoReset = false;
      info.reset();
    },
    afterRender(): void {
      if (!measuring) return;
      measuring = false;
      sampler.measured({ draws: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries, width: canvas.width, height: canvas.height, pixelRatio: deps.renderer.getPixelRatio() });
      held = false;
      info.autoReset = true;
    },
    note: (event: PerfEvent): void => sampler.note(event),
    left: (): void => finish('left'),
  };
}
