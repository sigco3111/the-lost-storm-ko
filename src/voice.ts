import type { LineDef } from '../sim/content/types.ts';

export interface VoicePlayer {
  play(line: LineDef): Promise<void>;
  stop(): void;
}
