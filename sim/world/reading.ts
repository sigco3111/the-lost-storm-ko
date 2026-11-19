export const READING = {
  least: 2.4,
  perWord: 0.38,
  gap: 0.26,
} as const;

export function lineSeconds(text: string): number {
  return Math.max(READING.least, text.split(/\s+/).length * READING.perWord) + READING.gap;
}
