import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Restartable } from './dom.ts';
import { retrigger } from './dom.ts';

interface Recorded extends Restartable {
  readonly steps: string[];
  readonly classes: Set<string>;
}

function recorded(start: readonly string[]): Recorded {
  const classes: Set<string> = new Set<string>(start);
  const steps: string[] = [];
  return {
    steps,
    classes,
    classList: {
      add(...tokens: string[]): void {
        for (const token of tokens) classes.add(token);
        steps.push(`add ${tokens.join(' ')}`);
      },
      remove(...tokens: string[]): void {
        for (const token of tokens) classes.delete(token);
        steps.push(`remove ${tokens.join(' ')}`);
      },
      contains(token: string): boolean {
        return classes.has(token);
      },
    },
    getBoundingClientRect(): null {
      steps.push('layout');
      return null;
    },
  };
}

void test('an animation class the element does not have is added with no forced layout', (): void => {
  const node: Recorded = recorded([]);
  retrigger(node, 'tick');
  assert.deepEqual(node.steps, ['add tick']);
  assert.equal(node.classes.has('tick'), true);
});

void test('an animation class still on the element is taken off and put back across one layout, so its animation restarts', (): void => {
  const node: Recorded = recorded(['pop']);
  retrigger(node, 'pop');
  assert.deepEqual(node.steps, ['remove pop', 'layout', 'add pop']);
  assert.equal(node.classes.has('pop'), true);
});
