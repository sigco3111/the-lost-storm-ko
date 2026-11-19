export interface Fade {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly end: number;
}

export function heldAt(level: number, time: number): Fade {
  return { from: level, to: level, start: time, end: time };
}

export function levelAt(fade: Fade, time: number): number {
  if (time >= fade.end) return fade.to;
  if (time <= fade.start) return fade.from;
  return fade.from + ((fade.to - fade.from) * (time - fade.start)) / (fade.end - fade.start);
}

export function fadeTo(current: Fade, time: number, to: number, seconds: number): Fade {
  return { from: levelAt(current, time), to, start: time, end: time + Math.max(0, seconds) };
}
