export interface GpuRegistry {
  hold(release: () => void): () => void;
  release(): void;
  readonly released: boolean;
}

export interface LoseContext {
  loseContext(): void;
}

export function createGpuRegistry(): GpuRegistry {
  const holders: Set<() => void> = new Set<() => void>();
  let released: boolean = false;
  return {
    hold(release: () => void): () => void {
      if (released) {
        release();
        return (): void => undefined;
      }
      holders.add(release);
      return (): void => {
        holders.delete(release);
      };
    },
    release(): void {
      if (released) return;
      released = true;
      const all: (() => void)[] = [...holders];
      holders.clear();
      for (const release of all) {
        try {
          release();
        } catch {
          continue;
        }
      }
    },
    get released(): boolean {
      return released;
    },
  };
}

export const GPU: GpuRegistry = createGpuRegistry();

export function loseContextOf(gl: WebGL2RenderingContext): () => void {
  return (): void => {
    const extension: LoseContext | null = gl.getExtension('WEBGL_lose_context');
    extension?.loseContext();
  };
}

export function reloadPage(): void {
  GPU.release();
  window.location.reload();
}
