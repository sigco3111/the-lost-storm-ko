import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Measurement } from '../../sim/measure.ts';
import { readStream } from '../../sim/measure.ts';
import { bossAttempts } from '../simulate-boss.ts';
import type { BossAttempt } from '../simulate-boss.ts';
import type { DoneMessage, JobMessage } from '../simulate-job.ts';
import { readDoneMessage } from '../simulate-job.ts';
import type { Job } from '../simulate-run.ts';
import type { RunSummary } from '../simulate-summary.ts';
import { summarize } from '../simulate-summary.ts';
import type { GuideBuildSpec, GuideSpec } from './builds.ts';
import { GUIDE_SPEC, guideJobs } from './builds.ts';
import { currentFingerprint } from './fingerprint.ts';
import type { BuildMeasure, Measured } from './measures.ts';
import { playMeasure } from './measures.ts';

const OUT: URL = new URL('./measured.json', import.meta.url);
const WORKER: URL = new URL('./measure-worker.ts', import.meta.url);

function runPool(jobs: readonly Job[], workers: number): Promise<string[]> {
  return new Promise((resolve: (streams: string[]) => void, reject: (error: Error) => void): void => {
    const streams: string[] = [];
    let next: number = 0;
    let finished: number = 0;
    const pool: Worker[] = [];
    const feed = (worker: Worker): void => {
      const job: Job | undefined = jobs[next];
      if (job === undefined) return;
      const message: JobMessage = { index: next, job };
      next += 1;
      worker.postMessage(message, []);
    };
    for (let index: number = 0; index < Math.max(1, Math.min(workers, jobs.length)); index += 1) {
      const worker: Worker = new Worker(WORKER);
      pool.push(worker);
      worker.on('error', (error: Error): void => {
        for (const each of pool) void each.terminate();
        reject(error);
      });
      worker.on('message', (value: unknown): void => {
        const done: DoneMessage = readDoneMessage(value);
        streams[done.index] = done.stream;
        finished += 1;
        process.stderr.write(`  ${finished}/${jobs.length} runs\r`);
        if (finished === jobs.length) {
          for (const each of pool) void each.terminate();
          resolve(streams);
          return;
        }
        feed(worker);
      });
      feed(worker);
    }
  });
}

function measureOf(spec: GuideSpec, build: GuideBuildSpec, summaries: readonly RunSummary[], attempts: readonly BossAttempt[]): BuildMeasure {
  const by = (skill: string): [RunSummary[], BossAttempt[]] => {
    const policy: string = `${skill}/${build.id}`;
    return [summaries.filter((run: RunSummary): boolean => run.policy === policy), attempts.filter((attempt: BossAttempt): boolean => attempt.policy === policy)];
  };
  const [steadyRuns, steadyBoss] = by(spec.skill);
  const [carelessRuns, carelessBoss] = by(spec.careless);
  return { id: build.id, steady: playMeasure(steadyRuns, steadyBoss, spec.levels), careless: playMeasure(carelessRuns, carelessBoss, spec.levels) };
}

async function main(): Promise<void> {
  const jobs: Job[] = guideJobs(GUIDE_SPEC);
  const started: number = performance.now();
  process.stderr.write(`guide: ${jobs.length} runs\n`);
  const streams: string[] = await runPool(jobs, Math.max(1, Math.floor(availableParallelism() / 2)));
  const parsed: (readonly Measurement[])[] = streams.map(readStream);
  const summaries: RunSummary[] = parsed.map(summarize);
  const attempts: BossAttempt[] = parsed.flatMap(bossAttempts);
  const measured: Measured = { fingerprint: currentFingerprint(), runs: GUIDE_SPEC.seeds.length, builds: GUIDE_SPEC.builds.map((build: GuideBuildSpec): BuildMeasure => measureOf(GUIDE_SPEC, build, summaries, attempts)) };
  writeFileSync(OUT, `${JSON.stringify(measured, null, 1)}\n`);
  process.stderr.write(`\n${((performance.now() - started) / 1000).toFixed(1)} s, wrote ${OUT.pathname}\n`);
}

await main();
