import type { GraphicsPreset, Quality } from '../settings/settings.ts';
import { describePreset, QUALITIES } from '../settings/settings.ts';
import type { GlitchSettings, GlitchSettingsStore } from '../glitch/glitch-settings.ts';
import type { SettingsStore } from '../settings/store.ts';
import { el, label, setText } from './dom.ts';

const QUALITY_LABELS: Readonly<Record<Quality, string>> = { low: '낮음', medium: '중간', high: '높음' };

function switchRow(page: HTMLElement, name: string, onClick: () => void): HTMLButtonElement {
  const row: HTMLDivElement = el('div', 'set-row', page);
  label('set-name', name, row);
  const toggle: HTMLButtonElement = el('button', 'set-switch', row);
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', name);
  el('span', 'set-switch-knob', toggle);
  toggle.addEventListener('click', onClick);
  return toggle;
}

function mountGlitchSwitches(page: HTMLElement, glitches: GlitchSettingsStore): void {
  const world: HTMLButtonElement = switchRow(page, '세계 뒤틀림', (): void => glitches.set({ glitches: !glitches.get().glitches }));
  const soft: HTMLButtonElement = switchRow(page, '번쩍임 줄이기', (): void => glitches.set({ reduceFlashes: !glitches.get().reduceFlashes }));
  const render = (current: GlitchSettings): void => {
    world.setAttribute('aria-checked', String(current.glitches));
    soft.setAttribute('aria-checked', String(current.reduceFlashes));
  };
  glitches.subscribe(render);
  render(glitches.get());
}

export function mountGraphics(page: HTMLElement, settings: SettingsStore, glitches: GlitchSettingsStore): void {
  const quality: HTMLDivElement = el('div', 'set-row', page);
  label('set-name', '품질', quality);
  const segment: HTMLDivElement = el('div', 'set-seg', quality);
  segment.setAttribute('role', 'radiogroup');
  segment.style.setProperty('--count', String(QUALITIES.length));
  el('div', 'set-seg-thumb', segment);
  const buttons: Map<Quality, HTMLButtonElement> = new Map<Quality, HTMLButtonElement>();
  for (const level of QUALITIES) {
    const button: HTMLButtonElement = el('button', 'set-seg-btn', segment);
    button.type = 'button';
    button.textContent = QUALITY_LABELS[level];
    button.setAttribute('role', 'radio');
    button.addEventListener('click', (): void => settings.setQuality(level));
    buttons.set(level, button);
  }
  const detail: HTMLDivElement = label('set-detail', '', page);

  const toggle: HTMLButtonElement = switchRow(page, '프레임 표시', (): void => settings.setShowFps(!settings.get().graphics.showFps));
  const lens: HTMLButtonElement = switchRow(page, '렌즈 물', (): void => settings.setLensWater(!settings.get().graphics.lensWater));
  const streak: HTMLButtonElement = switchRow(page, '궤적 효과', (): void => settings.setStreakEffects(!settings.get().graphics.streakEffects));
  mountGlitchSwitches(page, glitches);

  const render = (): void => {
    const current: Quality = settings.get().graphics.quality;
    segment.style.setProperty('--index', String(QUALITIES.indexOf(current)));
    for (const [level, button] of buttons) button.setAttribute('aria-checked', String(level === current));
    const preset: GraphicsPreset = settings.preset();
    setText(detail, describePreset(preset), true);
    toggle.setAttribute('aria-checked', String(settings.get().graphics.showFps));
    lens.setAttribute('aria-checked', String(settings.get().graphics.lensWater));
    streak.setAttribute('aria-checked', String(settings.get().graphics.streakEffects));
  };
  settings.subscribe(render);
  render();
}
