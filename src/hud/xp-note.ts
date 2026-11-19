import type { XpReduction } from '../../sim/content/types.ts';

const LINES: Readonly<Record<XpReduction['side'], string>> = {
  below: '경험치 감소: 이곳은 그대의 레벨보다 훨씬 낮다',
  above: '경험치 감소: 이곳은 그대의 레벨보다 훨씬 높다',
};

export function reducedLine(reduced: XpReduction | null): string | null {
  return reduced === null ? null : LINES[reduced.side];
}
