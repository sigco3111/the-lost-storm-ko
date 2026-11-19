export interface ProfileDoor {
  open(name: string): void;
  bind(opener: (name: string) => void): void;
}

export function createProfileDoor(): ProfileDoor {
  let opener: ((name: string) => void) | null = null;
  let waiting: string | null = null;
  return {
    open(name: string): void {
      if (opener === null) waiting = name;
      else opener(name);
    },
    bind(next: (name: string) => void): void {
      opener = next;
      if (waiting === null) return;
      const name: string = waiting;
      waiting = null;
      next(name);
    },
  };
}
