import { loadContent } from '../sim/content/content.ts';
import type { ZoneSweep } from './hidden-sweep.ts';
import { sweepFailed, sweepLines, sweepZones } from './hidden-sweep.ts';

const swept: ZoneSweep[] = sweepZones(loadContent());
process.stdout.write(`${sweepLines(swept).join('\n')}\n`);
if (sweepFailed(swept)) process.exitCode = 1;
