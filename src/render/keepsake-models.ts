import type { Keepsake } from './keepsake.ts';
import { createThreadRing } from './thread-ring.ts';

export const KEEPSAKE_MODELS: ReadonlyMap<string, () => Keepsake> = new Map<string, () => Keepsake>([['thread_ring', createThreadRing]]);
