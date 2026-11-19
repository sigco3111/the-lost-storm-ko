import { findActor } from './combat.ts';
import { settleTurn } from './momentum.ts';
import type { ActionState, Actor, ChannelState, World } from './types.ts';

export function beginChannel(world: World, actor: Actor, action: ActionState): void {
  if (action.skill.press?.type === 'channel') world.channels.push({ actorId: actor.id, action });
}

function channelling(world: World, channel: ChannelState): boolean {
  const actor: Actor | null = findActor(world, channel.actorId);
  return actor !== null && actor.alive && actor.action === channel.action && channel.action.phase !== 'recovery';
}

export function endChannels(world: World): void {
  if (world.channels.length === 0) return;
  world.channels = world.channels.filter((channel: ChannelState): boolean => {
    if (channelling(world, channel)) return true;
    world.events.push({ type: 'channel_end', actorId: channel.actorId, skill: channel.action.skill });
    return false;
  });
}

export function dropChannel(actor: Actor): void {
  const action: ActionState | null = actor.action;
  if (action === null || action.skill.press?.type !== 'channel') return;
  settleTurn(actor, action);
  actor.action = null;
}
