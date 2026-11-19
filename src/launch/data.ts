import alpha from '../../data/alpha.json' with { type: 'json' };
import { readAlphaRules } from './alpha.ts';
import type { AlphaRules } from './alpha.ts';

export const ALPHA_RULES: AlphaRules = readAlphaRules(alpha);
