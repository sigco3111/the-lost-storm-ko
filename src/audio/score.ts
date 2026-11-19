import type { Score, ScoreNote } from '../../sim/content/audio.ts';

export interface DueNote {
  readonly note: ScoreNote;
  readonly time: number;
}

export function notesBetween(score: Score, origin: number, from: number, to: number): readonly DueNote[] {
  if (to <= from) return [];
  const due: DueNote[] = [];
  const firstPass: number = Math.max(0, Math.floor((from - origin) / score.length));
  const lastPass: number = Math.floor((to - origin) / score.length);
  for (let pass: number = firstPass; pass <= lastPass; pass += 1) {
    const start: number = origin + pass * score.length;
    for (const note of score.notes) {
      const time: number = start + note.at;
      if (time >= from && time < to) due.push({ note, time });
    }
  }
  return due.toSorted((a: DueNote, b: DueNote): number => a.time - b.time);
}

export function scoreSounds(score: Score | null): readonly string[] {
  if (score === null) return [];
  return [...new Set<string>(score.notes.map((note: ScoreNote): string => note.sound))];
}
