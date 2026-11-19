import { EVENTS_PROTOCOL } from '../backend/api.ts';
import type { PlayerEventBody, PlayerEventField, PlayerEventKind } from '../backend/api.ts';
import type { OverlayId } from '../hud/overlay-table.ts';
import type { Command } from '../../sim/world/command-types.ts';
import type { ItemInstance, World, WorldEvent } from '../../sim/world/types.ts';

export const PLAYER_EVENTS = {
  pulseMs: 60_000,
  msPerSecond: 1000,
} as const;

type Fields = Readonly<Record<string, PlayerEventField>>;

function clip(value: PlayerEventField): PlayerEventField {
  if (typeof value === 'string') return value.slice(0, EVENTS_PROTOCOL.textChars);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return value;
}

export function playerEvent(kind: PlayerEventKind, world: World, at: number, fields: Fields = {}): PlayerEventBody {
  const kept: Record<string, PlayerEventField> = {};
  for (const [key, value] of Object.entries(fields).slice(0, EVENTS_PROTOCOL.maxFields)) kept[key] = clip(value);
  return { kind, at, zone: world.zone.id, fields: kept };
}

function fromWorldEvent(event: WorldEvent, world: World, at: number): PlayerEventBody | null {
  if (event.type === 'zone_changed') return playerEvent('zone', world, at, { from: event.from, to: event.to });
  if (event.type === 'level_up') return playerEvent('level', world, at, { level: event.level });
  if (event.type === 'death') return event.team === 'player' && event.actorId === world.player.id ? playerEvent('died', world, at, { level: world.player.level }) : null;
  if (event.type === 'boss_defeated') return playerEvent('boss', world, at, { monster: event.monster, first: event.first });
  if (event.type === 'quest_started') return playerEvent('quest', world, at, { quest: event.quest, stage: 'started' });
  if (event.type === 'quest_completed') return playerEvent('quest', world, at, { quest: event.quest, stage: 'completed' });
  if (event.type === 'skill_unlocked') return playerEvent('skill', world, at, { skill: event.skill });
  if (event.type === 'flask_upgraded') return playerEvent('flask', world, at, { flask: event.flask, tier: event.tier });
  if (event.type === 'waypoint_unlocked') return playerEvent('waypoint', world, at, { unlocked: event.zone });
  if (event.type === 'run_set') return playerEvent('run', world, at, { run: event.zone, stage: 'set' });
  if (event.type === 'run_ended') return playerEvent('run', world, at, { run: event.zone, stage: event.end });
  return null;
}

export function worldEvents(events: readonly WorldEvent[], world: World, at: number): PlayerEventBody[] {
  const found: PlayerEventBody[] = [];
  for (const event of events) {
    const tracked: PlayerEventBody | null = fromWorldEvent(event, world, at);
    if (tracked !== null) found.push(tracked);
  }
  return found;
}

export function commandEvent(command: Command, world: World, at: number): PlayerEventBody | null {
  if (command.type === 'allocate') return playerEvent('allocate', world, at, { node: command.node });
  if (command.type === 'refund') return playerEvent('refund', world, at, { node: command.node });
  if (command.type === 'respec') return playerEvent('respec', world, at);
  if (command.type === 'slot') return playerEvent('slot', world, at, { slot: command.slot, skill: command.skill ?? '' });
  if (command.type === 'trade') return playerEvent('trade', world, at, { action: command.action.type, service: world.service?.kind ?? '' });
  if (command.type === 'travel') return playerEvent('travel', world, at, { exit: command.exit });
  if (command.type === 'teleport') return playerEvent('travel', world, at, { waypoint: command.zone });
  if (command.type !== 'equip') return null;
  const item: ItemInstance | null | undefined = world.player.inventory[command.inventoryIndex];
  return item === null || item === undefined ? null : playerEvent('equip', world, at, { base: item.base, rarity: item.rarity, level: item.level });
}

export function openedPanels(before: readonly OverlayId[], after: readonly OverlayId[], world: World, at: number): PlayerEventBody[] {
  return after.filter((id: OverlayId): boolean => !before.includes(id)).map((id: OverlayId): PlayerEventBody => playerEvent('panel', world, at, id === 'trade' ? { panel: id, service: world.service?.kind ?? '' } : { panel: id }));
}

export function enteredEvent(world: World, at: number): PlayerEventBody {
  return playerEvent('entered', world, at, { level: world.player.level, hero: world.player.hero });
}

export function pulseEvent(world: World, at: number, idleMs: number): PlayerEventBody {
  return playerEvent('pulse', world, at, {
    level: world.player.level,
    xp: Math.round(world.player.xp),
    kills: world.player.kills,
    gold: world.player.gold,
    x: Math.round(world.player.pos.x),
    z: Math.round(world.player.pos.z),
    idle: Math.round(idleMs / PLAYER_EVENTS.msPerSecond),
  });
}
