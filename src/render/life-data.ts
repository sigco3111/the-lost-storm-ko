import life from '../../data/life.json' with { type: 'json' };
import type { LifeRules } from './life-kinds.ts';
import { readLife } from './life-kinds.ts';

export const LIFE: LifeRules = readLife(life);
