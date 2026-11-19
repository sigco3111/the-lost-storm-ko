export const ITEM_NAMES = {
  sessionKey: 'lost-storm.item-names',
  on: '1',
  altCodes: ['AltLeft', 'AltRight'],
} as const;

export type KeyPhase = 'keydown' | 'keyup';

export interface KeyPress {
  readonly phase: KeyPhase;
  readonly code: string;
  readonly altKey: boolean;
  readonly editable: boolean;
}

export interface FlagStore {
  read(): boolean;
  write(on: boolean): void;
}

export interface ItemNames {
  shown(): boolean;
  held(): boolean;
  toggled(): boolean;
  setToggled(on: boolean): void;
  key(press: KeyPress): boolean;
  pointer(altKey: boolean): void;
  lose(): void;
  subscribe(listener: (shown: boolean) => void): () => void;
}

function altBound(codes: readonly string[]): boolean {
  return codes.some((code: string): boolean => ITEM_NAMES.altCodes.some((alt: string): boolean => alt === code));
}

export function createItemNames(bindings: () => readonly string[], store: FlagStore): ItemNames {
  const down: Set<string> = new Set<string>();
  let toggled: boolean = store.read();
  const listeners: Set<(shown: boolean) => void> = new Set<(shown: boolean) => void>();
  let last: boolean = toggled;
  const shown = (): boolean => toggled || down.size > 0;
  const changed = (): void => {
    const now: boolean = shown();
    if (now === last) return;
    last = now;
    for (const listener of listeners) listener(now);
  };
  return {
    shown,
    held: (): boolean => down.size > 0,
    toggled: (): boolean => toggled,
    setToggled(on: boolean): void {
      if (on === toggled) return;
      toggled = on;
      store.write(on);
      changed();
    },
    key(press: KeyPress): boolean {
      const codes: readonly string[] = bindings();
      const bound: boolean = codes.includes(press.code);
      if (press.phase === 'keyup') {
        if (bound) down.delete(press.code);
        changed();
        return bound && !press.editable;
      }
      if (press.editable) return false;
      if (bound) {
        down.add(press.code);
        changed();
        return true;
      }
      return press.altKey && altBound(codes);
    },
    pointer(altKey: boolean): void {
      const codes: readonly string[] = bindings();
      if (!altBound(codes)) return;
      if (!altKey) {
        for (const code of ITEM_NAMES.altCodes) down.delete(code);
      } else if (down.size === 0) {
        const first: string | undefined = codes.find((code: string): boolean => ITEM_NAMES.altCodes.some((alt: string): boolean => alt === code));
        if (first !== undefined) down.add(first);
      }
      changed();
    },
    lose(): void {
      down.clear();
      changed();
    },
    subscribe(listener: (shown: boolean) => void): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

function editable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
}

export function sessionFlag(key: string): FlagStore {
  return {
    read(): boolean {
      try {
        return window.sessionStorage.getItem(key) === ITEM_NAMES.on;
      } catch {
        return false;
      }
    },
    write(on: boolean): void {
      try {
        if (on) window.sessionStorage.setItem(key, ITEM_NAMES.on);
        else window.sessionStorage.removeItem(key);
      } catch {
        return;
      }
    },
  };
}

export function watchItemNames(names: ItemNames, target: Window): void {
  const onKey = (event: KeyboardEvent): void => {
    const phase: KeyPhase = event.type === 'keyup' ? 'keyup' : 'keydown';
    if (names.key({ phase, code: event.code, altKey: event.altKey, editable: editable(event.target) })) event.preventDefault();
  };
  target.addEventListener('keydown', onKey);
  target.addEventListener('keyup', onKey);
  const onPointer = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') names.pointer(event.altKey);
  };
  target.addEventListener('pointermove', onPointer);
  target.addEventListener('pointerdown', onPointer);
  target.addEventListener('blur', (): void => names.lose());
  target.document.addEventListener('visibilitychange', (): void => {
    if (target.document.visibilityState === 'hidden') names.lose();
  });
}
