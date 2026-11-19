import type { Logger } from './backend.ts';

const PREFIX: string = '클라우드 저장:';

export function createConsoleLogger(): Logger {
  return {
    info: (message: string): void => {
      console.info(`${PREFIX} ${message}`);
    },
    warn: (message: string): void => {
      console.warn(`${PREFIX} ${message}`);
    },
  };
}

export function warnInConsole(message: string): void {
  console.warn(message);
}

export function noteInConsole(message: string): void {
  console.info(message);
}
