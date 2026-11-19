export const VOICE_LINES = {
  fadeSeconds: 0.06,
  startSeconds: 4,
} as const;

export interface SpokenClip {
  fadeOut(seconds: number): void;
  readonly spoken: Promise<void>;
  readonly ended: Promise<void>;
}

export interface VoiceLineDeps<T> {
  find(clipId: string): Promise<string | null>;
  load(path: string): Promise<T | null>;
  play(clip: T): SpokenClip;
  wait(seconds: number): Promise<void>;
}

export interface VoiceLines {
  say(speaker: string, clipId: string): Promise<void>;
  hush(): void;
  speaking(): readonly string[];
  anySpeaking(): boolean;
}

interface Speaker {
  ticket: number;
  clip: SpokenClip | null;
  talking: boolean;
}

export function createVoiceLines<T>(deps: VoiceLineDeps<T>): VoiceLines {
  const speakers: Map<string, Speaker> = new Map<string, Speaker>();

  const speakerOf = (id: string): Speaker => {
    const known: Speaker | undefined = speakers.get(id);
    if (known !== undefined) return known;
    const fresh: Speaker = { ticket: 0, clip: null, talking: false };
    speakers.set(id, fresh);
    return fresh;
  };

  const release = async (speaker: Speaker, clip: SpokenClip): Promise<void> => {
    await clip.ended;
    if (speaker.clip !== clip) return;
    speaker.clip = null;
    speaker.talking = false;
  };

  const silence = (speaker: Speaker): void => {
    speaker.ticket += 1;
    const clip: SpokenClip | null = speaker.clip;
    speaker.clip = null;
    speaker.talking = false;
    clip?.fadeOut(VOICE_LINES.fadeSeconds);
  };

  return {
    async say(id: string, clipId: string): Promise<void> {
      const speaker: Speaker = speakerOf(id);
      silence(speaker);
      const ticket: number = speaker.ticket;
      const late: Promise<null> = deps.wait(VOICE_LINES.startSeconds).then((): null => null);
      const path: string | null = await Promise.race([deps.find(clipId), late]);
      if (path === null || ticket !== speaker.ticket) return;
      const loaded: T | null = await Promise.race([deps.load(path), late]);
      if (loaded === null || ticket !== speaker.ticket) return;
      const clip: SpokenClip = deps.play(loaded);
      speaker.clip = clip;
      speaker.talking = true;
      void release(speaker, clip);
      await Promise.race([clip.spoken, clip.ended]);
      if (speaker.clip === clip) speaker.talking = false;
    },
    hush(): void {
      for (const speaker of speakers.values()) silence(speaker);
    },
    speaking(): readonly string[] {
      return [...speakers.entries()].filter(([, speaker]: [string, Speaker]): boolean => speaker.talking).map(([id]: [string, Speaker]): string => id);
    },
    anySpeaking(): boolean {
      for (const speaker of speakers.values()) {
        if (speaker.talking) return true;
      }
      return false;
    },
  };
}
