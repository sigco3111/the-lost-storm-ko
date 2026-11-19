import { CONTENT } from './simulate-run.ts';
import { POLICIES } from './simulate-policies.ts';
import type { TrialAttempt, TrialRow } from './simulate-trial.ts';
import { bestWeapon, runTrial, TRIAL, trialRow, trialTable } from './simulate-trial.ts';

const TRIAL_CLI = {
  zone: 'ledger_court',
  runs: 6,
  tries: 4,
  skills: 'careful,average,poor',
  builds: 'caster:staff:man,windrunner:crossbow:woman',
  seedStride: 100,
} as const;

function option(name: string, fallback: string): string {
  const at: number = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
}

const runs: number = Number(option('runs', String(TRIAL_CLI.runs)));
const tries: number = Number(option('tries', String(TRIAL_CLI.tries)));
const limit: number = Number(option('limit', String(TRIAL.limit)));
const rows: TrialRow[] = [];
for (const entry of option('build', TRIAL_CLI.builds).split(',')) {
  const [build = '', kind = '', hero = ''] = entry.split(':');
  const weapon = bestWeapon(CONTENT, kind, TRIAL.level);
  if (weapon === null) throw new Error(`no ${kind} weapon at level ${TRIAL.level}`);
  for (const skill of option('skill', TRIAL_CLI.skills).split(',')) {
    const done: TrialAttempt[][] = [];
    for (let seed: number = 1; seed <= runs; seed += 1) {
      const attempts: TrialAttempt[] = [];
      for (let attempt: number = 0; attempt < tries; attempt += 1) {
        const tried: TrialAttempt = runTrial(CONTENT, POLICIES, { zone: option('zone', TRIAL_CLI.zone), skill, build, weapon: weapon.id, hero: hero === '' ? null : hero, seed: seed * TRIAL_CLI.seedStride + attempt, limit });
        attempts.push(tried);
        process.stderr.write(`${build} ${skill} hero ${seed} try ${attempt + 1}: ${tried.outcome} ${tried.seconds}s phase ${tried.phase + 1} boss ${tried.lifeLeft} flasks ${tried.flasks} hero ${tried.heroLife} boss ${tried.bossLife} hurt ${tried.hurt} pieces ${tried.onPieces}s\n`);
        if (tried.outcome === 'won') break;
      }
      done.push(attempts);
    }
    rows.push(trialRow(build, skill, done));
  }
}
process.stdout.write(`${trialTable(rows)}\n`);
