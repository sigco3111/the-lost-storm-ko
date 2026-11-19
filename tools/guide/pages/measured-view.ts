import type { BossAt, BuildMeasure, LevelReach, PlayMeasure } from '../measures.ts';
import { decimal, esc, minutes, percent, table } from '../html.ts';

export interface NamedMeasure {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly measure: BuildMeasure;
}

export interface Bars {
  readonly title: string;
  readonly hint: string;
  readonly value: (measure: BuildMeasure) => number | null;
  readonly show: (value: number) => string;
  readonly lowerIsBetter: boolean;
}

export function reach(measure: PlayMeasure, level: number): LevelReach | null {
  return measure.levels.find((entry: LevelReach): boolean => entry.level === level) ?? null;
}

export function bossAt(measure: PlayMeasure, level: number): BossAt | null {
  return measure.boss.find((entry: BossAt): boolean => entry.level === level) ?? null;
}

export function levelMinutes(measure: PlayMeasure, level: number): number | null {
  const entry: LevelReach | null = reach(measure, level);
  return entry === null || entry.share < 1 ? null : entry.minutes;
}

function bar(entry: NamedMeasure, value: number | null, top: number, spec: Bars, current: string): string {
  const width: number = value === null || top <= 0 ? 0 : Math.max(2, Math.round((value / top) * 100));
  const shown: string = value === null ? '매번은 아님' : spec.show(value);
  return `<li${entry.id === current ? ' class="here"' : ''}><span class="bar-name"><a href="${esc(entry.href)}">${esc(entry.name)}</a></span><span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span><span class="bar-value">${esc(shown)}</span></li>`;
}

export function barChart(entries: readonly NamedMeasure[], spec: Bars, current: string): string {
  const values: readonly (number | null)[] = entries.map((entry: NamedMeasure): number | null => spec.value(entry.measure));
  const top: number = Math.max(0, ...values.map((value: number | null): number => value ?? 0));
  return `<figure class="bars">
<figcaption><b>${esc(spec.title)}</b> <span>${esc(spec.hint)}</span></figcaption>
<ul>${entries.map((entry: NamedMeasure, index: number): string => bar(entry, values[index] ?? null, top, spec, current)).join('')}</ul>
</figure>`;
}

function levelCell(measure: PlayMeasure, level: number): string {
  const entry: LevelReach | null = reach(measure, level);
  if (entry === null || entry.minutes === null) return '–';
  return entry.share < 1 ? `${minutes(entry.minutes)} (실행의 ${percent(entry.share)})` : minutes(entry.minutes);
}

function bossCell(measure: PlayMeasure, level: number): string {
  const entry: BossAt | null = bossAt(measure, level);
  if (entry === null || entry.attempts === 0) return '–';
  const life: string = entry.lifeLeft === null ? '' : `, 남은 생명력 ${percent(entry.lifeLeft)}`;
  return `${percent(entry.winShare)} 승리${life}`;
}

export function measuredTable(entries: readonly NamedMeasure[], levels: readonly number[], bossLevel: number): string {
  return table({
    head: ['빌드', ...levels.map((level: number): string => `${level}레벨`), '분당 처치', `${bossLevel}레벨 우두머리`, `${bossLevel}레벨 우두머리, 부주의`, '시간당 사망, 부주의'],
    rows: entries.map((entry: NamedMeasure): string[] => [
      `<a href="${esc(entry.href)}">${esc(entry.name)}</a>`,
      ...levels.map((level: number): string => levelCell(entry.measure.steady, level)),
      decimal(entry.measure.steady.killsPerMinute, 1),
      bossCell(entry.measure.steady, bossLevel),
      bossCell(entry.measure.careless, bossLevel),
      decimal(entry.measure.careless.deathsPerHour, 1),
    ]),
    className: 'wide',
  });
}
