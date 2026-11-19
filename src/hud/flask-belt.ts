import type { FlaskResource } from '../../sim/content/flasks.ts';
import type { Content } from '../../sim/content/types.ts';
import { upgradeReady } from '../../sim/world/flask-tiers.ts';
import type { FlaskState, PlayerState } from '../../sim/world/types.ts';
import type { FlaskReading } from './flask-gauge.ts';
import { flaskGauge, readFlask } from './flask-gauge.ts';
import type { FlaskVessel } from './flask-vessel.ts';
import { createVessel } from './flask-vessel.ts';

export interface FlaskHosts {
  flask(resource: FlaskResource): HTMLElement;
}

export interface FlaskBelt {
  update(player: PlayerState): void;
  refused(player: PlayerState): void;
  refreshKeys(): void;
}

export function createFlaskBelt(hosts: FlaskHosts, content: Content, flasks: readonly FlaskState[], keyOf: (slot: number) => string, setRestoring: (resource: FlaskResource, on: boolean) => void): FlaskBelt {
  const vessels: FlaskVessel[] = flasks.map((flask: FlaskState): FlaskVessel => {
    const reading: FlaskReading = readFlask(flask);
    const vessel: FlaskVessel = createVessel(hosts.flask(flask.def.resource), flask.def.resource, true, reading);
    vessel.paint(reading);
    return vessel;
  });
  const showKeys = (animate: boolean): void => {
    vessels.forEach((vessel: FlaskVessel, slot: number): void => {
      vessel.setKey(keyOf(slot), animate);
    });
  };
  showKeys(false);
  return {
    update(player: PlayerState): void {
      const restoring: Record<FlaskResource, boolean> = { life: false, mana: false };
      player.flasks.forEach((flask: FlaskState, slot: number): void => {
        const reading: FlaskReading = readFlask(flask);
        vessels[slot]?.paint(reading);
        vessels[slot]?.setMark(upgradeReady(content, player, flask));
        if (reading.restoring) restoring[flask.def.resource] = true;
      });
      setRestoring('life', restoring.life);
      setRestoring('mana', restoring.mana);
    },
    refused(player: PlayerState): void {
      player.flasks.forEach((flask: FlaskState, slot: number): void => {
        if (flaskGauge(readFlask(flask)).empty) vessels[slot]?.refuse();
      });
    },
    refreshKeys(): void {
      showKeys(true);
    },
  };
}
