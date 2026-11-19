import type { PerfOutcome } from '../backend/perf-api.ts';
import { createBrowserEventsClient, pagePlay } from '../backend/browser.ts';
import type { EventsClient } from '../backend/events-api.ts';
import type { PlayerEventBody } from '../backend/api.ts';
import type { OverlayId } from '../hud/overlay-table.ts';
import { buildId } from '../perf/device-facts.ts';
import type { Command } from '../../sim/world/command-types.ts';
import type { World, WorldEvent } from '../../sim/world/types.ts';
import { emptyEventOutbox, eventsAnswered, eventsDue, queuedEvents, takeEvents } from './event-outbox.ts';
import type { EventHeader, EventOutbox, TakenEvents } from './event-outbox.ts';
import { commandEvent, enteredEvent, openedPanels, PLAYER_EVENTS, pulseEvent, worldEvents } from './player-events.ts';

export interface TrackDeps {
  readonly serverUrl: string | undefined;
  readonly build: string | undefined;
  readonly world: World;
  readonly touch: boolean;
}

export interface Tracker {
  entered(): void;
  world(events: readonly WorldEvent[]): void;
  command(command: Command): void;
  overlays(visible: readonly OverlayId[]): void;
  frame(now: number, inPlay: boolean): void;
}

function nothing(): void {}

const SILENT: Tracker = { entered: nothing, world: nothing, command: nothing, overlays: nothing, frame: nothing };

export function startTracking(deps: TrackDeps): Tracker {
  const client: EventsClient | null = createBrowserEventsClient(deps.serverUrl);
  if (client === null) return SILENT;
  let box: EventOutbox = emptyEventOutbox(performance.now());
  let open: readonly OverlayId[] = [];
  let lastCommand: number = performance.now();
  let lastPulse: number = performance.now();
  const header = (): EventHeader => ({ play: pagePlay().id, build: buildId(deps.build), device: deps.touch ? 'phone' : 'desktop' });
  const add = (events: readonly PlayerEventBody[]): void => {
    box = queuedEvents(box, events);
  };
  const deliver = async (taken: TakenEvents): Promise<void> => {
    const outcome: PerfOutcome = await client.send(taken.batch.text, taken.batch.anonymous);
    box = eventsAnswered(box, taken.batch, outcome, performance.now());
  };
  const pump = (final: boolean): void => {
    const now: number = performance.now();
    if (!eventsDue(box, now, final)) return;
    const taken: TakenEvents | null = takeEvents(box, header(), now);
    if (taken === null) return;
    box = taken.box;
    void deliver(taken);
  };
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) pump(true);
  });
  window.addEventListener('pagehide', (): void => pump(true));
  return {
    entered(): void {
      lastPulse = performance.now();
      lastCommand = lastPulse;
      add([enteredEvent(deps.world, Date.now())]);
      pump(true);
    },
    world(events: readonly WorldEvent[]): void {
      add(worldEvents(events, deps.world, Date.now()));
    },
    command(command: Command): void {
      lastCommand = performance.now();
      const tracked: PlayerEventBody | null = commandEvent(command, deps.world, Date.now());
      if (tracked !== null) add([tracked]);
    },
    overlays(visible: readonly OverlayId[]): void {
      add(openedPanels(open, visible, deps.world, Date.now()));
      open = [...visible];
    },
    frame(now: number, inPlay: boolean): void {
      if (inPlay && now - lastPulse >= PLAYER_EVENTS.pulseMs) {
        lastPulse = now;
        add([pulseEvent(deps.world, Date.now(), now - lastCommand)]);
      }
      if (box.queue.length > 0) pump(false);
    },
  };
}
