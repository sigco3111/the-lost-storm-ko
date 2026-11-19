import { Vector2 } from 'three';
import type { IsoCamera } from './iso-camera.ts';
import { planNumber } from './number-crowd.ts';
import type { LiveNumber, NumberKind, NumberPlan } from './number-crowd.ts';
import { place } from './overlay-place.ts';

export const FLOATING_NUMBERS = {
  numberLife: 1,
  retireLife: 0.14,
  numberDrift: 26,
  numberPool: 48,
} as const;

interface NumberNode {
  readonly element: HTMLDivElement;
  readonly inner: HTMLSpanElement;
  readonly face: HTMLElement;
}

interface FloatingNumber extends LiveNumber {
  readonly node: NumberNode;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  age: number;
  life: number;
  amount: number;
  retiring: boolean;
  grew: number;
}

export interface NumberShow {
  readonly amount: number;
  readonly kind: NumberKind;
  readonly key: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FloatingNumbers {
  readonly show: (number: NumberShow) => void;
  readonly update: (dt: number) => void;
}

const NUMBER_TEXT: Readonly<Record<NumberKind, (amount: number) => string>> = {
  plain: (amount: number): string => `${amount}`,
  hurt: (amount: number): string => `${amount}`,
  burn: (amount: number): string => `${amount}`,
  crit: (amount: number): string => `${amount}!`,
  gold: (amount: number): string => `+${amount} gold`,
  heal: (amount: number): string => `+${amount}`,
};

const KIND_CLASS: Readonly<Record<NumberKind, string>> = { plain: '', crit: 'crit', hurt: 'hurt', burn: 'burn', gold: 'gold', heal: 'heal' };

export function createFloatingNumbers(layer: HTMLElement, camera: IsoCamera): FloatingNumbers {
  const numbers: FloatingNumber[] = [];
  const spareNumbers: NumberNode[] = [];
  const point: Vector2 = new Vector2();

  const numberNode = (): NumberNode => {
    const spare: NumberNode | undefined = spareNumbers.pop();
    if (spare !== undefined) {
      spare.element.style.transform = '';
      return spare;
    }
    const element: HTMLDivElement = document.createElement('div');
    const inner: HTMLSpanElement = document.createElement('span');
    const face: HTMLElement = document.createElement('b');
    inner.append(face);
    element.append(inner);
    return { element, inner, face };
  };

  const retire = (number: FloatingNumber): void => {
    number.retiring = true;
    number.life = Math.min(number.life, number.age + FLOATING_NUMBERS.retireLife);
    number.node.element.classList.add('retiring');
  };

  const grow = (number: FloatingNumber, amount: number): void => {
    number.amount += amount;
    number.grew += 1;
    number.node.face.textContent = NUMBER_TEXT[number.kind](number.amount);
    number.node.face.className = number.grew % 2 === 0 ? 'grew-a' : 'grew-b';
  };

  const show = (incoming: NumberShow): void => {
    const plan: NumberPlan = planNumber(numbers, incoming);
    if (plan.type === 'merge') {
      const target: FloatingNumber | undefined = numbers[plan.index];
      if (target !== undefined) grow(target, incoming.amount);
      return;
    }
    for (const index of plan.retire) {
      const old: FloatingNumber | undefined = numbers[index];
      if (old !== undefined) retire(old);
    }
    const node: NumberNode = numberNode();
    node.element.className = ['damage-number', KIND_CLASS[incoming.kind], plan.quiet ? 'quiet' : ''].filter((name: string): boolean => name !== '').join(' ');
    node.face.className = '';
    node.face.textContent = NUMBER_TEXT[incoming.kind](incoming.amount);
    node.inner.style.setProperty('--drift', `${((Math.random() - 0.5) * 2 * FLOATING_NUMBERS.numberDrift).toFixed(0)}px`);
    layer.append(node.element);
    numbers.push({ node, key: incoming.key, kind: incoming.kind, x: incoming.x, y: incoming.y, z: incoming.z, age: 0, life: FLOATING_NUMBERS.numberLife, amount: incoming.amount, retiring: false, grew: 0 });
  };

  const update = (dt: number): void => {
    for (let index: number = numbers.length - 1; index >= 0; index -= 1) {
      const number: FloatingNumber | undefined = numbers[index];
      if (number === undefined) continue;
      number.age += dt;
      if (number.age > number.life) {
        number.node.element.remove();
        if (spareNumbers.length < FLOATING_NUMBERS.numberPool) spareNumbers.push(number.node);
        numbers.splice(index, 1);
        continue;
      }
      camera.project(number.x, number.y, number.z, point);
      place(number.node.element, point);
    }
  };

  return { show, update };
}
