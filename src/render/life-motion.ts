import type { BirdKind, CrawlerKind, FlockHabit, LifeGroup, LifeKind, MothKind } from './life-kinds.ts';

export const LIFE_MOTION = {
  offBelow: 0.5,
  turnRate: 7,
  bird: { steer: 2.6, arrive: 0.12, landSlow: 2.2, climbFlap: 0.25, glideFlap: 0.18, flapUp: 6, flapDown: 1.6, preenEvery: 3.5, preenTurn: 0.9, leave: 1.6, wobble: 0.35, wobbleRate: 0.7, groundFlap: 0 },
  crawler: { arrive: 0.05, leash: 3, fleeTurn: 0.6, safe: 1.8, stepRate: 2.2, jitter: 0.35, pauseShare: 0.6 },
  moth: { rateX: 1.3, rateY: 2.1, rateZ: 1.7, drift: 0.4, rise: 0.35, flap: 1 },
  seed: { a: 12.9898, b: 78.233, c: 43758.5453, group: 97, member: 13, draws: 10 },
  preenFrom: 0.5,
  idleFlap: 0.5,
} as const;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Hero {
  readonly x: number;
  readonly z: number;
}

export type BirdMode = 'perched' | 'flying' | 'landing';
export type CrawlerMode = 'still' | 'amble' | 'flee';

export interface Creature {
  readonly kind: LifeKind;
  readonly habit: FlockHabit;
  readonly home: Point3;
  readonly centre: Point3;
  readonly pos: Point3;
  readonly velocity: Point3;
  readonly target: Point3;
  yaw: number;
  phase: number;
  flap: number;
  pace: number;
  timer: number;
  angle: number;
  birdMode: BirdMode;
  crawlerMode: CrawlerMode;
  draws: number;
  readonly seed: number;
}

export function chance(seed: number, salt: number): number {
  const value: number = Math.sin(seed * LIFE_MOTION.seed.a + salt * LIFE_MOTION.seed.b) * LIFE_MOTION.seed.c;
  return value - Math.floor(value);
}

function nextChance(creature: Creature): number {
  creature.draws += 1;
  return chance(creature.seed, creature.draws);
}

export function lifeCount(count: number, density: number): number {
  if (density < LIFE_MOTION.offBelow) return 0;
  return Math.max(1, Math.round(count * Math.min(1, density)));
}

export function spawnGroup(kind: LifeKind, group: LifeGroup, density: number, salt: number): Creature[] {
  const made: Creature[] = [];
  const count: number = lifeCount(group.count, density);
  for (let index: number = 0; index < count; index += 1) {
    const seed: number = salt * LIFE_MOTION.seed.group + index * LIFE_MOTION.seed.member + 1;
    const turn: number = chance(seed, 1) * Math.PI * 2;
    const reach: number = Math.sqrt(chance(seed, 2)) * group.spread;
    const home: Point3 = { x: group.x + Math.cos(turn) * reach, y: group.y, z: group.z + Math.sin(turn) * reach };
    const circling: boolean = kind.form === 'bird' && group.habit === 'circle';
    const angle: number = chance(seed, 3) * Math.PI * 2;
    const start: Point3 = circling && kind.form === 'bird' ? { x: group.x + Math.cos(angle) * kind.circleRadius, y: group.y + kind.circleHeight, z: group.z + Math.sin(angle) * kind.circleRadius } : { ...home };
    made.push({
      kind,
      habit: group.habit,
      home,
      centre: { x: group.x, y: group.y, z: group.z },
      pos: { ...start },
      velocity: { x: 0, y: 0, z: 0 },
      target: { ...start },
      yaw: chance(seed, 4) * Math.PI * 2,
      phase: chance(seed, 5) * Math.PI * 2,
      flap: 0,
      pace: 0,
      timer: chance(seed, 6) * (kind.form === 'crawler' ? kind.pause : LIFE_MOTION.bird.preenEvery),
      angle,
      birdMode: circling ? 'flying' : 'perched',
      crawlerMode: 'still',
      draws: LIFE_MOTION.seed.draws,
      seed,
    });
  }
  return made;
}

function towardYaw(from: number, to: number, rate: number): number {
  const delta: number = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * Math.min(1, rate);
}

function heroGap(creature: Creature, hero: Hero): number {
  return Math.hypot(creature.pos.x - hero.x, creature.pos.z - hero.z);
}

function homeGap(creature: Creature, hero: Hero): number {
  return Math.hypot(creature.home.x - hero.x, creature.home.z - hero.z);
}

const CIRCLE_GOAL: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

function circlePoint(creature: Creature, kind: BirdKind, time: number): Point3 {
  const wobble: number = LIFE_MOTION.bird.wobble * Math.sin(time * LIFE_MOTION.bird.wobbleRate + creature.seed);
  const radius: number = kind.circleRadius * (1 + wobble * LIFE_MOTION.bird.wobble);
  CIRCLE_GOAL.x = creature.centre.x + Math.cos(creature.angle) * radius;
  CIRCLE_GOAL.y = creature.centre.y + kind.circleHeight + wobble;
  CIRCLE_GOAL.z = creature.centre.z + Math.sin(creature.angle) * radius;
  return CIRCLE_GOAL;
}

function fly(creature: Creature, kind: BirdKind, goal: Point3, top: number, dt: number): number {
  const dx: number = goal.x - creature.pos.x;
  const dy: number = goal.y - creature.pos.y;
  const dz: number = goal.z - creature.pos.z;
  const gap: number = Math.hypot(dx, dy, dz);
  const speed: number = Math.min(top, gap * LIFE_MOTION.bird.landSlow + kind.size);
  const blend: number = 1 - Math.exp(-LIFE_MOTION.bird.steer * dt);
  const wantedX: number = gap > 0 ? (dx / gap) * speed : 0;
  const wantedY: number = gap > 0 ? (dy / gap) * speed : 0;
  const wantedZ: number = gap > 0 ? (dz / gap) * speed : 0;
  creature.velocity.x += (wantedX - creature.velocity.x) * blend;
  creature.velocity.y += (wantedY - creature.velocity.y) * blend;
  creature.velocity.z += (wantedZ - creature.velocity.z) * blend;
  creature.pos.x += creature.velocity.x * dt;
  creature.pos.y += creature.velocity.y * dt;
  creature.pos.z += creature.velocity.z * dt;
  const level: number = Math.hypot(creature.velocity.x, creature.velocity.z);
  if (level > kind.size) creature.yaw = towardYaw(creature.yaw, Math.atan2(creature.velocity.x, creature.velocity.z), LIFE_MOTION.turnRate * dt);
  return gap;
}

function settleFlap(creature: Creature, want: number, dt: number): void {
  const rate: number = want > creature.flap ? LIFE_MOTION.bird.flapUp : LIFE_MOTION.bird.flapDown;
  creature.flap += (want - creature.flap) * Math.min(1, rate * dt);
}

export function stepBird(creature: Creature, kind: BirdKind, hero: Hero, time: number, dt: number): void {
  switch (creature.birdMode) {
    case 'perched': {
      creature.timer -= dt;
      if (creature.timer <= 0) {
        creature.timer = LIFE_MOTION.bird.preenEvery * (LIFE_MOTION.preenFrom + nextChance(creature));
        creature.yaw += (nextChance(creature) * 2 - 1) * LIFE_MOTION.bird.preenTurn;
      }
      settleFlap(creature, LIFE_MOTION.bird.groundFlap, dt);
      if (heroGap(creature, hero) < kind.flee) {
        creature.birdMode = 'flying';
        creature.timer = kind.settle;
        creature.angle = Math.atan2(creature.pos.z - creature.centre.z, creature.pos.x - creature.centre.x);
        creature.velocity.y = kind.speed * LIFE_MOTION.bird.climbFlap;
      }
      break;
    }
    case 'flying': {
      creature.angle += (kind.circleSpeed * dt) * (creature.seed % 2 === 0 ? 1 : -1);
      const goal: Point3 = circlePoint(creature, kind, time);
      fly(creature, kind, goal, kind.speed, dt);
      settleFlap(creature, creature.velocity.y > LIFE_MOTION.bird.climbFlap ? 1 : LIFE_MOTION.bird.glideFlap + LIFE_MOTION.bird.glideFlap * Math.max(0, Math.sin(time * LIFE_MOTION.bird.wobbleRate + creature.seed)), dt);
      creature.timer -= dt;
      if (creature.habit === 'perch' && creature.timer <= 0 && homeGap(creature, hero) > kind.flee * LIFE_MOTION.bird.leave) creature.birdMode = 'landing';
      break;
    }
    case 'landing': {
      const gap: number = fly(creature, kind, creature.home, kind.speed, dt);
      settleFlap(creature, gap < kind.flee ? 1 : LIFE_MOTION.bird.glideFlap, dt);
      if (heroGap(creature, hero) < kind.flee) {
        creature.birdMode = 'flying';
        creature.timer = kind.settle;
      } else if (gap < LIFE_MOTION.bird.arrive) {
        creature.birdMode = 'perched';
        creature.pos.x = creature.home.x;
        creature.pos.y = creature.home.y;
        creature.pos.z = creature.home.z;
        creature.velocity.x = 0;
        creature.velocity.y = 0;
        creature.velocity.z = 0;
      }
      break;
    }
  }
  creature.phase += kind.flapRate * Math.PI * 2 * dt * (creature.flap > LIFE_MOTION.bird.glideFlap ? 1 : LIFE_MOTION.idleFlap);
}

function pickRoam(creature: Creature, kind: CrawlerKind): void {
  const turn: number = nextChance(creature) * Math.PI * 2;
  const reach: number = Math.sqrt(nextChance(creature)) * kind.roam;
  creature.target.x = creature.home.x + Math.cos(turn) * reach;
  creature.target.z = creature.home.z + Math.sin(turn) * reach;
}

function crawl(creature: Creature, toward: number, speed: number, dt: number): void {
  creature.yaw = towardYaw(creature.yaw, toward, LIFE_MOTION.turnRate * dt);
  creature.pos.x += Math.sin(creature.yaw) * speed * dt;
  creature.pos.z += Math.cos(creature.yaw) * speed * dt;
  creature.pace = speed;
}

function leash(creature: Creature, kind: CrawlerKind): void {
  const dx: number = creature.pos.x - creature.home.x;
  const dz: number = creature.pos.z - creature.home.z;
  const gap: number = Math.hypot(dx, dz);
  const most: number = kind.roam * LIFE_MOTION.crawler.leash;
  if (gap <= most) return;
  creature.pos.x = creature.home.x + (dx / gap) * most;
  creature.pos.z = creature.home.z + (dz / gap) * most;
}

export function stepCrawler(creature: Creature, kind: CrawlerKind, hero: Hero, dt: number): void {
  const near: number = heroGap(creature, hero);
  if (near < kind.flee && creature.crawlerMode !== 'flee') {
    creature.crawlerMode = 'flee';
    creature.angle = (nextChance(creature) * 2 - 1) * LIFE_MOTION.crawler.fleeTurn;
  }
  switch (creature.crawlerMode) {
    case 'still':
      creature.pace = 0;
      creature.timer -= dt;
      if (creature.timer <= 0) {
        pickRoam(creature, kind);
        creature.crawlerMode = 'amble';
      }
      break;
    case 'amble': {
      const dx: number = creature.target.x - creature.pos.x;
      const dz: number = creature.target.z - creature.pos.z;
      if (Math.hypot(dx, dz) < LIFE_MOTION.crawler.arrive + kind.size) {
        creature.crawlerMode = 'still';
        creature.timer = kind.pause * (LIFE_MOTION.crawler.pauseShare + nextChance(creature));
        creature.pace = 0;
        break;
      }
      crawl(creature, Math.atan2(dx, dz), kind.amble, dt);
      break;
    }
    case 'flee': {
      const away: number = Math.atan2(creature.pos.x - hero.x, creature.pos.z - hero.z) + creature.angle;
      crawl(creature, away, kind.speed, dt);
      if (near > kind.flee * LIFE_MOTION.crawler.safe) {
        creature.crawlerMode = 'still';
        creature.timer = kind.pause;
        creature.home.x = creature.pos.x;
        creature.home.z = creature.pos.z;
      }
      break;
    }
  }
  if (creature.crawlerMode !== 'flee') leash(creature, kind);
  creature.phase += creature.pace / Math.max(kind.stride, kind.size) * LIFE_MOTION.crawler.stepRate * dt;
}

export function stepMoth(creature: Creature, kind: MothKind, time: number, dt: number): void {
  const t: number = time * kind.speed + creature.seed;
  const x: number = creature.home.x + kind.roam * Math.sin(t * LIFE_MOTION.moth.rateX) * (1 - LIFE_MOTION.moth.drift + LIFE_MOTION.moth.drift * Math.sin(t * LIFE_MOTION.moth.rateY));
  const z: number = creature.home.z + kind.roam * Math.sin(t * LIFE_MOTION.moth.rateZ + creature.seed);
  const y: number = creature.home.y + kind.height + kind.roam * LIFE_MOTION.moth.rise * Math.sin(t * LIFE_MOTION.moth.rateY);
  const dx: number = x - creature.pos.x;
  const dz: number = z - creature.pos.z;
  if (Math.hypot(dx, dz) > 0) creature.yaw = Math.atan2(dx, dz);
  creature.pos.x = x;
  creature.pos.y = y;
  creature.pos.z = z;
  creature.flap = LIFE_MOTION.moth.flap;
  creature.phase += kind.flapRate * Math.PI * 2 * dt;
}

export function stepCreature(creature: Creature, hero: Hero, time: number, dt: number): void {
  const kind: LifeKind = creature.kind;
  switch (kind.form) {
    case 'bird':
      stepBird(creature, kind, hero, time, dt);
      break;
    case 'crawler':
      stepCrawler(creature, kind, hero, dt);
      break;
    case 'moth':
      stepMoth(creature, kind, time, dt);
      break;
    case 'bat':
      break;
  }
}
