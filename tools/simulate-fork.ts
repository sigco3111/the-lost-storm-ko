import type { Bot, BotHabits } from '../sim/bot.ts';
import type { BotPlan } from '../sim/bot-plan.ts';
import { createRng } from '../sim/rng.ts';
import type { World } from '../sim/world/types.ts';

export function forkWorld(world: World): World {
  const { content, rng, glitch, ...rest } = world;
  const { rng: glitchRng, ...glitchRest } = glitch;
  return { ...structuredClone(rest), content, rng: createRng(rng.state()), glitch: { ...structuredClone(glitchRest), rng: createRng(glitchRng.state()) } };
}

export function forkBot(bot: Bot, habits: BotHabits, plan: BotPlan): Bot {
  return { ...bot, world: forkWorld(bot.world), events: [], habits, watch: null, plan, progressPos: { x: bot.progressPos.x, z: bot.progressPos.z }, ignored: new Map<number, number>(bot.ignored), discarded: new Set<number>(bot.discarded) };
}
