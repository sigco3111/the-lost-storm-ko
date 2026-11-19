import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fields, items, text } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';
import type { FightPlan } from '../src/bench/fight-bench.ts';
import type { FightArgs, FightMeta, FightReport } from './fight-bench-report.ts';
import { compareLines, FIGHT_DEFAULTS, fightArgs, fightPlan, fightProfileFor, fightReport, isQuiet, planName, readRaw, readReport, reportLines } from './fight-bench-report.ts';

const BENCH = {
  serverWaitMs: 60000,
  chromeWaitMs: 20000,
  stepWaitMs: 90000,
  pollMs: 500,
  settleMs: 1500,
  benchSlackMs: 90000,
  stopGraceMs: 3000,
  errorsShown: 12,
  portFile: 'DevToolsActivePort',
  ownerPlaying: join(homedir(), 'Dev', 'ops', 'lanes', 'owner-playing'),
  stored: [
    { key: 'the-lost-storm.audio.v1', value: { volumes: { master: 0, effects: 0, voice: 0, ambience: 0 }, muted: true } },
    { key: 'the-lost-storm.settings.v1', value: { graphics: { quality: 'high', showFps: false, lensWater: true }, controls: {} } },
    { key: 'the-lost-storm.glitches.v1', value: { glitches: false, reduceFlashes: false } },
  ],
  steps: ['^enter$', '^(choose for me|take .+)$', '^enter$'],
  begin: '^(enter the storm|continue)$',
  uncappedFlags: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
} as const;

type CdpListener = (params: Fields) => void;

interface Cdp {
  call(method: string, params: Readonly<Record<string, unknown>>, timeoutMs?: number): Promise<Fields>;
  on(method: string, listener: CdpListener): void;
  close(): void;
}

interface Started {
  readonly process: ChildProcess;
  readonly label: string;
}

function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => void setTimeout(resolve, ms));
}

async function until<T>(what: string, ms: number, attempt: () => Promise<T | null>, waited: number = 0): Promise<T> {
  const found: T | null = await attempt().catch((): null => null);
  if (found !== null) return found;
  if (waited >= ms) throw new Error(`Gave up waiting for ${what} after ${ms} ms`);
  await pause(BENCH.pollMs);
  return until(what, ms, attempt, waited + BENCH.pollMs);
}

async function startServer(port: number): Promise<{ readonly url: string; readonly started: Started }> {
  const url: string = `http://localhost:${port}`;
  const taken: boolean = await fetch(`${url}/play/`).then((): boolean => true, (): boolean => false);
  if (taken) throw new Error(`Port ${port} is already served by another process, which may be another checkout; pass a free --port`);
  const server: ChildProcess = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  await until('the dev server', BENCH.serverWaitMs, async (): Promise<boolean | null> => ((await fetch(`${url}/play/`)).ok ? true : null));
  return { url, started: { process: server, label: 'dev server' } };
}

function startChrome(args: FightArgs): { readonly started: Started; readonly profile: string } {
  const profile: string = join(tmpdir(), fightProfileFor(fileURLToPath(new URL('..', import.meta.url))));
  mkdirSync(profile, { recursive: true });
  rmSync(join(profile, BENCH.portFile), { force: true });
  const flags: string[] = ['--headless=new', '--use-angle=metal', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--force-device-scale-factor=${FIGHT_DEFAULTS.scale}`, `--window-size=${FIGHT_DEFAULTS.width},${FIGHT_DEFAULTS.height}`, ...(args.uncapped ? BENCH.uncappedFlags : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'];
  return { started: { process: spawn(args.chrome, flags, { stdio: 'ignore', detached: true }), label: 'Chrome' }, profile };
}

function signalGroup(started: Started, signal: NodeJS.Signals): void {
  const pid: number | undefined = started.process.pid;
  if (pid === undefined || started.process.exitCode !== null || started.process.signalCode !== null) return;
  try {
    process.kill(-pid, signal);
  } catch {
    started.process.kill(signal);
  }
}

async function stopAll(started: readonly Started[]): Promise<void> {
  for (const each of started) signalGroup(each, 'SIGTERM');
  await pause(BENCH.stopGraceMs);
  for (const each of started) signalGroup(each, 'SIGKILL');
}

async function pageSocket(profile: string): Promise<string> {
  return until('a page in Chrome', BENCH.chromeWaitMs, async (): Promise<string | null> => {
    const port: string | undefined = readFileSync(join(profile, BENCH.portFile), 'utf8').split('\n')[0];
    if (port === undefined) return null;
    const listed: readonly unknown[] = items(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(), 'targets');
    const page: Fields | undefined = listed.map((entry: unknown): Fields => fields(entry, 'target')).find((target: Fields): boolean => target['type'] === 'page');
    return page === undefined ? null : text(page, 'webSocketDebuggerUrl', 'target');
  });
}

function connect(address: string): Promise<Cdp> {
  const socket: WebSocket = new WebSocket(address);
  const waiting: Map<number, { readonly resolve: (value: Fields) => void; readonly reject: (error: Error) => void }> = new Map();
  const listeners: Map<string, CdpListener[]> = new Map<string, CdpListener[]>();
  let next: number = 1;
  socket.addEventListener('message', (event: MessageEvent): void => {
    const message: Fields = fields(JSON.parse(String(event.data)), 'cdp message');
    const method: unknown = message['method'];
    if (typeof method === 'string') {
      for (const listener of listeners.get(method) ?? []) listener(fields(message['params'] ?? {}, 'cdp event'));
      return;
    }
    const id: unknown = message['id'];
    const pending = typeof id === 'number' ? waiting.get(id) : undefined;
    if (pending === undefined || typeof id !== 'number') return;
    waiting.delete(id);
    if (message['error'] !== undefined) pending.reject(new Error(JSON.stringify(message['error'])));
    else pending.resolve(fields(message['result'] ?? {}, 'cdp result'));
  });
  return new Promise<Cdp>((resolve: (cdp: Cdp) => void, reject: (error: Error) => void): void => {
    socket.addEventListener('error', (): void => reject(new Error(`Could not reach Chrome at ${address}`)));
    socket.addEventListener('open', (): void =>
      resolve({
        call: (method: string, params: Readonly<Record<string, unknown>>, timeoutMs: number = BENCH.stepWaitMs): Promise<Fields> =>
          new Promise<Fields>((done: (value: Fields) => void, fail: (error: Error) => void): void => {
            const id: number = next;
            next += 1;
            const timer: NodeJS.Timeout = setTimeout((): void => {
              waiting.delete(id);
              fail(new Error(`${method} timed out`));
            }, timeoutMs);
            waiting.set(id, {
              resolve: (value: Fields): void => {
                clearTimeout(timer);
                done(value);
              },
              reject: (error: Error): void => {
                clearTimeout(timer);
                fail(error);
              },
            });
            socket.send(JSON.stringify({ id, method, params }));
          }),
        on: (method: string, listener: CdpListener): void => {
          listeners.set(method, [...(listeners.get(method) ?? []), listener]);
        },
        close: (): void => socket.close(),
      }),
    );
  });
}

async function evaluate(cdp: Cdp, expression: string, timeoutMs: number = BENCH.stepWaitMs): Promise<unknown> {
  const reply: Fields = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
  if (reply['exceptionDetails'] !== undefined) throw new Error(`The page threw: ${JSON.stringify(reply['exceptionDetails'])}`);
  return fields(reply['result'], 'evaluate result')['value'];
}

function clickExpression(pattern: string): string {
  return `(() => { const wanted = new RegExp(${JSON.stringify(pattern)}, 'i'); const button = [...document.querySelectorAll('button')].find((candidate) => !candidate.disabled && candidate.offsetParent !== null && wanted.test((candidate.textContent ?? '').trim())); if (button === undefined) return false; button.click(); return true; })()`;
}

async function clickThrough(cdp: Cdp, steps: readonly string[]): Promise<void> {
  const [step, ...later] = steps;
  if (step === undefined) return;
  await until(`a button matching ${step}`, BENCH.stepWaitMs, async (): Promise<boolean | null> => ((await evaluate(cdp, clickExpression(step))) === true ? true : null)).catch(async (error: unknown): Promise<never> => {
    const shown: unknown = await evaluate(cdp, "[...document.querySelectorAll('button')].filter((button) => button.offsetParent !== null).map((button) => (button.disabled ? '(off) ' : '') + (button.textContent ?? '').trim()).join(' | ')").catch((): string => 'unknown');
    throw new Error(`${error instanceof Error ? error.message : String(error)}; buttons shown: ${String(shown)}`);
  });
  await pause(BENCH.settleMs);
  await clickThrough(cdp, later);
}

function storeExpression(): string {
  return `${BENCH.stored.map((entry: { readonly key: string; readonly value: unknown }): string => `localStorage.setItem(${JSON.stringify(entry.key)}, ${JSON.stringify(JSON.stringify(entry.value))})`).join('; ')}; true`;
}

async function enterPlay(cdp: Cdp, url: string, hero: string): Promise<void> {
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: FIGHT_DEFAULTS.width, height: FIGHT_DEFAULTS.height, deviceScaleFactor: FIGHT_DEFAULTS.scale, mobile: false });
  await cdp.call('Storage.clearDataForOrigin', { origin: url, storageTypes: 'all' });
  await cdp.call('Page.navigate', { url: `${url}/` });
  await pause(BENCH.settleMs);
  await evaluate(cdp, storeExpression());
  await cdp.call('Page.navigate', { url: `${url}/play/` });
  await clickThrough(cdp, [...BENCH.steps, `^${hero}`, BENCH.begin]);
  await until('the world to run', BENCH.stepWaitMs, async (): Promise<boolean | null> => {
    const before: unknown = await evaluate(cdp, 'window.storm?.world.time ?? null');
    await pause(BENCH.settleMs);
    const after: unknown = await evaluate(cdp, 'window.storm?.world.time ?? null');
    return typeof before === 'number' && typeof after === 'number' && after > before ? true : null;
  });
}

function listenForErrors(cdp: Cdp, into: string[]): Promise<Fields> {
  cdp.on('Runtime.exceptionThrown', (params: Fields): void => {
    const details: Fields = fields(params['exceptionDetails'] ?? {}, 'exception');
    const thrown: unknown = fields(details['exception'] ?? {}, 'exception value')['description'];
    into.push(`exception: ${typeof thrown === 'string' ? thrown.split('\n')[0] ?? thrown : JSON.stringify(details['text'] ?? null)}`);
  });
  cdp.on('Runtime.consoleAPICalled', (params: Fields): void => {
    if (params['type'] !== 'error') return;
    into.push(`console error: ${items(params['args'] ?? [], 'console args').map((arg: unknown): string => JSON.stringify(fields(arg, 'console arg')['value'] ?? fields(arg, 'console arg')['description'] ?? null)).join(' ')}`);
  });
  return cdp.call('Runtime.enable', {});
}

function commitOf(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function readReportFile(path: string): FightReport {
  return readReport(JSON.parse(readFileSync(path, 'utf8')));
}

async function measure(args: FightArgs, plan: FightPlan): Promise<FightReport> {
  const loadBefore: number = loadavg()[0] ?? 0;
  const playingBefore: boolean = existsSync(BENCH.ownerPlaying);
  const started: Started[] = [];
  const errors: string[] = [];
  let cdp: Cdp | null = null;
  try {
    const server = args.url === null ? await startServer(args.port) : null;
    if (server !== null) started.push(server.started);
    const chrome = startChrome(args);
    started.push(chrome.started);
    cdp = await connect(await pageSocket(chrome.profile));
    await listenForErrors(cdp, errors);
    await enterPlay(cdp, args.url ?? server?.url ?? '', args.hero);
    const raw: unknown = await evaluate(cdp, `window.storm === undefined ? Promise.reject(new Error("no window.storm: bench a dev build")) : window.storm.bench(${JSON.stringify(plan)})`, plan.warmupMs + plan.measureMs + BENCH.benchSlackMs);
    const load: number = Math.max(loadBefore, loadavg()[0] ?? 0);
    const meta: FightMeta = { plan: planName(args.short, !args.uncapped), zone: plan.zone, commit: commitOf(), at: new Date().toISOString(), load: Math.round(load * 100) / 100, quiet: isQuiet(load, playingBefore || existsSync(BENCH.ownerPlaying)), capped: !args.uncapped, width: FIGHT_DEFAULTS.width, height: FIGHT_DEFAULTS.height, scale: FIGHT_DEFAULTS.scale, warmupMs: plan.warmupMs, measureMs: plan.measureMs };
    return fightReport(readRaw(raw), meta);
  } finally {
    for (const error of errors.slice(0, BENCH.errorsShown)) console.error(`page ${error}`);
    cdp?.close();
    await stopAll(started);
  }
}

async function main(): Promise<number> {
  const args: FightArgs = fightArgs(process.argv.slice(2), process.env);
  if (args.compare !== null && args.to !== null) {
    for (const line of compareLines(readReportFile(args.compare), readReportFile(args.to))) console.error(line);
    return 0;
  }
  const report: FightReport = await measure(args, fightPlan(args.short));
  const json: string = JSON.stringify(report, null, 2);
  if (args.out !== null) writeFileSync(args.out, `${json}\n`);
  for (const line of reportLines(report)) console.error(line);
  if (args.compare !== null) for (const line of compareLines(readReportFile(args.compare), report)) console.error(line);
  console.log(json);
  return report.problems.length === 0 ? 0 : 1;
}

main().then(
  (code: number): number => {
    process.exitCode = code;
    return code;
  },
  (error: unknown): void => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
