export type IdleSchedule = (work: () => void) => void;

export interface IdleQueue<T> {
  add(item: T): void;
  pending(): number;
}

export function createIdleQueue<T>(work: (item: T) => void, done: (item: T) => boolean, schedule: IdleSchedule): IdleQueue<T> {
  const queue: T[] = [];
  let scheduled: boolean = false;
  const step = (): void => {
    scheduled = false;
    const item: T | undefined = queue.shift();
    if (item === undefined) return;
    if (!done(item)) work(item);
    if (queue.length === 0) return;
    scheduled = true;
    schedule(step);
  };
  return {
    add(item: T): void {
      if (done(item) || queue.includes(item)) return;
      queue.push(item);
      if (scheduled) return;
      scheduled = true;
      schedule(step);
    },
    pending(): number {
      return queue.length;
    },
  };
}
