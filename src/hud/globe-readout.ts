export function globeReadout(value: number, max: number): string {
  const shownMax: number = Math.max(0, Math.round(max));
  const shownValue: number = Math.min(Math.max(0, Math.ceil(value)), shownMax);
  return `${shownValue} / ${shownMax}`;
}
