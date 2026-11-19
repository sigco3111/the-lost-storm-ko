import type { GlitchDef, GlitchKind, GlitchProgress, GlitchStage, TriggerMoment } from '../content/glitches.ts';
import { distance } from '../math.ts';
import { createRng } from '../rng.ts';
import { allHold } from './conditions.ts';
import type { ActiveGlitch, GlitchRequest, GlitchSave, GlitchSource, GlitchState } from './glitch-types.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

export const GLITCH = {
  secondsPerMinute: 60,
} as const;

export type GlitchBlock = 'off' | 'dead' | 'active' | 'cooldown' | 'low_life' | 'telegraph';

export function createGlitchState(def: GlitchDef, seed: number, save: GlitchSave | null): GlitchState {
  return {
    def,
    rng: createRng((seed ^ def.seed) >>> 0),
    enabled: true,
    progress: save?.progress ?? 0,
    fired: save === null ? [] : [...save.fired],
    active: null,
    holdUntil: 0,
    readyAt: 0,
    combatTime: 0,
    lastFight: -Infinity,
    requests: [],
    wrongWord: null,
  };
}

export function glitchToSave(state: GlitchState): GlitchSave {
  return { progress: state.progress, fired: [...state.fired] };
}

function stageOf(def: GlitchDef, progress: number): GlitchStage {
  let found: GlitchStage | undefined = def.stages[0];
  for (const stage of def.stages) if (stage.from <= progress) found = stage;
  if (found === undefined) throw new Error('glitch data has no stages');
  return found;
}

export function storyProgress(world: World): number {
  return world.glitch.def.progress.reduce((best: number, entry: GlitchProgress): number => (entry.value > best && allHold(world, entry.when) ? entry.value : best), world.glitch.progress);
}

function lethalTelegraph(world: World): boolean {
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.action?.phase === 'windup' && (monster.def.boss !== null || monster.damageMax >= world.player.life));
}

export function glitchBlock(world: World, request: GlitchRequest): GlitchBlock | null {
  const state: GlitchState = world.glitch;
  const player = world.player;
  if (!state.enabled && request.source !== 'debug') return 'off';
  if (!player.alive || world.death !== null) return 'dead';
  if (state.active !== null) return 'active';
  if (request.source !== 'debug' && world.time < state.readyAt) return 'cooldown';
  if (lethalTelegraph(world)) return 'telegraph';
  if (player.life < player.maxLife * state.def.rules.minLifeFraction) return 'low_life';
  return null;
}

function noteFights(world: World): void {
  const hero: number = world.player.id;
  if (world.events.some((event: WorldEvent): boolean => event.type === 'damage' && (event.targetId === hero || event.sourceId === hero))) world.glitch.lastFight = world.time;
}

export function requestGlitch(world: World, kind: GlitchKind, source: GlitchSource): void {
  world.glitch.requests.push({ kind, source, trigger: null });
}

export function setGlitchesEnabled(world: World, enabled: boolean): void {
  world.glitch.enabled = enabled;
  if (!enabled) {
    world.glitch.requests = world.glitch.requests.filter((request: GlitchRequest): boolean => request.source === 'debug');
    world.glitch.wrongWord = null;
  }
}

function interruptMonsters(world: World): void {
  for (const monster of world.monsters) {
    if (!monster.alive || monster.action === null || monster.action.phase !== 'windup') continue;
    monster.action = null;
    world.events.push({ type: 'skill_interrupt', actorId: monster.id });
  }
}

function holdFor(world: World, seconds: number): void {
  const state: GlitchState = world.glitch;
  state.holdUntil = Math.max(state.holdUntil, world.time + seconds + state.def.rules.grace);
  interruptMonsters(world);
}

function begin(world: World, request: GlitchRequest): void {
  const state: GlitchState = world.glitch;
  if (request.trigger !== null && !state.fired.includes(request.trigger)) state.fired.push(request.trigger);
  state.readyAt = world.time + state.def.rules.cooldown;
  if (request.kind === 'wrong_word') {
    state.wrongWord = world.time + state.def.wrongWord.window;
    world.events.push({ type: 'glitch_start', kind: request.kind, duration: 0 });
    return;
  }
  const duration: number = state.def.stutter;
  state.active = { kind: request.kind, duration, elapsed: 0 };
  holdFor(world, duration);
  world.events.push({ type: 'glitch_start', kind: request.kind, duration });
}

function finish(world: World, active: ActiveGlitch): void {
  world.glitch.active = null;
  world.events.push({ type: 'glitch_end', kind: active.kind });
}

function inCombat(world: World): boolean {
  const radius: number = world.glitch.def.rules.combatRadius;
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.aggro && distance(monster.pos, world.player.pos) <= radius);
}

function queued(state: GlitchState, trigger: string): boolean {
  return state.requests.some((request: GlitchRequest): boolean => request.trigger === trigger);
}

function rollCombat(world: World, stage: GlitchStage, dt: number): void {
  const state: GlitchState = world.glitch;
  if (!inCombat(world)) {
    state.combatTime = 0;
    return;
  }
  state.combatTime += dt;
  const tick: number = state.def.rules.combatTick;
  while (state.combatTime >= tick) {
    state.combatTime -= tick;
    if (state.active !== null || state.requests.length > 0 || world.time < state.readyAt) continue;
    if (!state.rng.chance((stage.combatChancePerMinute * tick) / GLITCH.secondsPerMinute)) continue;
    const kind: GlitchKind | undefined = stage.kinds[Math.min(stage.kinds.length - 1, Math.floor(state.rng.next() * stage.kinds.length))];
    if (kind !== undefined) state.requests.push({ kind, source: 'combat', trigger: null });
  }
}

function momentHolds(world: World, moment: TriggerMoment): boolean {
  const engaged: boolean = inCombat(world);
  const holds: Readonly<Record<TriggerMoment, boolean>> = { combat: engaged, calm: !engaged, any: true };
  return holds[moment];
}

function watchStory(world: World): void {
  const state: GlitchState = world.glitch;
  for (const trigger of state.def.triggers) {
    if (state.fired.includes(trigger.id) || queued(state, trigger.id) || !momentHolds(world, trigger.during) || !allHold(world, trigger.when)) continue;
    state.requests.push({ kind: trigger.kind, source: 'story', trigger: trigger.id });
  }
}

const LASTING: Readonly<Record<GlitchSource, boolean>> = { story: true, debug: true, combat: false };

function lasting(source: GlitchSource): boolean {
  return LASTING[source];
}

function serve(world: World): void {
  const state: GlitchState = world.glitch;
  const waiting: GlitchRequest[] = [];
  let started: boolean = false;
  for (const request of state.requests) {
    if (started) {
      if (lasting(request.source)) waiting.push(request);
      continue;
    }
    const block: GlitchBlock | null = glitchBlock(world, request);
    if (block === null) {
      begin(world, request);
      started = true;
    } else if (lasting(request.source) && block !== 'off') waiting.push(request);
  }
  state.requests = waiting;
}

export function stepGlitch(world: World, dt: number): void {
  const state: GlitchState = world.glitch;
  const active: ActiveGlitch | null = state.active;
  if (active !== null) {
    active.elapsed += dt;
    if (active.elapsed >= active.duration) finish(world, active);
  }
  noteFights(world);
  state.progress = storyProgress(world);
  const stage: GlitchStage = stageOf(state.def, state.progress);
  if (state.enabled) {
    watchStory(world);
    rollCombat(world, stage, dt);
  }
  serve(world);
}
