import type { LifeSoundEvent } from '../sim/content/audio.ts';
import type { Vec2 } from '../sim/math.ts';
import type { LifeEvent } from './render/life-view.ts';

export interface LifeSound {
  readonly event: LifeSoundEvent;
  readonly at: Vec2;
}

const SOUND_OF: Readonly<Record<LifeEvent['type'], LifeSoundEvent>> = { 'bats-disturbed': 'bats_disturbed', 'bat-flyby': 'bat_flyby', 'lid-opened': 'lid_opened', 'lid-closed': 'lid_closed' };

export function lifeSounds(events: readonly LifeEvent[]): readonly LifeSound[] {
  return events.map((event: LifeEvent): LifeSound => ({ event: SOUND_OF[event.type], at: { x: event.x, z: event.z } }));
}
