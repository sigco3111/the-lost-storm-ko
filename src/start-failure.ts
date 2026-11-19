import { reloadPage } from './gpu-release.ts';
import { BROWSER_NOTICES, claimRetry, clearRetry, failureText, reloadHelps, sessionStore } from './browser-support.ts';

export function showStartFailure(error: unknown, freeze: () => void): void {
  if (reloadHelps(error) && claimRetry(sessionStore(window))) {
    reloadPage();
    return;
  }
  freeze();
  const status: HTMLElement | null = document.getElementById('title-status');
  if (status !== null) {
    status.textContent = failureText(error);
    status.classList.add('failed');
  }
  document.getElementById('title-loader')?.classList.add('done');
  const enter: HTMLElement | null = document.getElementById('title-enter');
  if (reloadHelps(error) && enter instanceof HTMLButtonElement) {
    enter.textContent = BROWSER_NOTICES.reload;
    enter.disabled = false;
    enter.addEventListener('click', reloadPage);
    document.getElementById('title')?.classList.add('stuck');
  }
}

export function runStart(start: () => Promise<void>, freeze: () => void): void {
  start()
    .then((): void => clearRetry(sessionStore(window)))
    .catch((error: unknown): void => {
      showStartFailure(error, freeze);
      throw error;
    });
}
