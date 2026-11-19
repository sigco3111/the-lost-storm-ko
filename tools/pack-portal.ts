import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { INERT_ADDRESSES, PORTAL, addressesIn, checkLimits, describeReport, filesUnder, localRefs, megabytes, outsideAddresses, portalTarget } from './portal.ts';
import type { PortalFile, PortalReport, PortalTarget } from './portal.ts';

function fail(message: string): never {
  process.stderr.write(`portal: ${message}\n`);
  process.exit(1);
}

const ROOT: string = resolve(import.meta.dirname, '..');
const target: PortalTarget = portalTarget(process.argv[2] ?? PORTAL.mode) ?? fail(`no portal build named ${process.argv[2] ?? ''}`);
const OUT: string = join(ROOT, target.outDir);
const ZIP: string = join(ROOT, target.zip);
const ZIP_ARGS: readonly string[] = ['-q', '-r', '-D', '-X', '-FS', ZIP, '.'];

if (!existsSync(join(OUT, PORTAL.page.to))) fail(`no ${target.outDir}/${PORTAL.page.to}; run vite build --mode ${target.mode} first`);

const page: string = readFileSync(join(OUT, PORTAL.page.to), 'utf8');
const missing: readonly string[] = localRefs(page).filter((path: string): boolean => !existsSync(join(OUT, path)));
if (missing.length > 0) fail(`${PORTAL.page.to} points at files the build did not ship: ${missing.join(', ')}`);

const files: readonly PortalFile[] = filesUnder(OUT);
const report: PortalReport = checkLimits(files, PORTAL.limits);
process.stdout.write(`portal: ${target.outDir}/ holds ${describeReport(report)}\n`);
if (report.problems.length > 0) fail(`over the portal limits:\n  ${report.problems.join('\n  ')}`);

if (target.sealed) {
  const texts: readonly string[] = files.map((file: PortalFile): string => readFileSync(join(OUT, file.path), 'latin1'));
  const outside: readonly string[] = files.flatMap((file: PortalFile, index: number): string[] => outsideAddresses(texts[index] ?? '').map((address: string): string => `${file.path}: ${address}`));
  if (outside.length > 0) fail(`the ${target.mode} build names outside addresses:\n  ${outside.join('\n  ')}`);
  const inert: readonly string[] = [...new Set<string>(texts.flatMap((text: string): readonly string[] => addressesIn(text)))];
  for (const address of inert) process.stdout.write(`portal: kept ${address}: ${INERT_ADDRESSES[address] ?? ''}\n`);
  process.stdout.write(`portal: no outside address in ${target.outDir}/\n`);
}

execFileSync('zip', ZIP_ARGS, { cwd: OUT, stdio: 'inherit' });
process.stdout.write(`portal: wrote ${target.zip} (${megabytes(statSync(ZIP).size)})\n`);
