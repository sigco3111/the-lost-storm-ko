import type { BookDef, PageDef } from '../../sim/content/story-types.ts';
import type { LineDef } from '../../sim/content/types.ts';

export interface PageVoiceDeps {
  busy(): boolean;
  soundOn(): boolean;
  say(line: LineDef): void;
}

export interface PageVoice {
  opened(line: LineDef | null): void;
  update(): void;
  closed(): void;
}

type PageVoiceState = { readonly kind: 'quiet' } | { readonly kind: 'waiting'; readonly line: LineDef };

const QUIET: PageVoiceState = { kind: 'quiet' };

export function pageLine(lines: ReadonlyMap<string, LineDef>, pages: readonly PageDef[]): LineDef | null {
  for (const page of pages) {
    const line: LineDef | undefined = page.voice === null ? undefined : lines.get(page.voice);
    if (line !== undefined) return line;
  }
  return null;
}

export function bookVoiceIds(books: Iterable<BookDef>, lines: ReadonlyMap<string, LineDef>): string[] {
  const ids: Set<string> = new Set<string>();
  for (const book of books) {
    for (const page of book.pages) {
      const line: LineDef | undefined = page.voice === null ? undefined : lines.get(page.voice);
      if (line !== undefined) ids.add(line.id);
    }
  }
  return [...ids];
}

export function createPageVoice(deps: PageVoiceDeps): PageVoice {
  let state: PageVoiceState = QUIET;

  const attempt = (): void => {
    switch (state.kind) {
      case 'quiet':
        return;
      case 'waiting':
        if (!deps.soundOn()) {
          state = QUIET;
          return;
        }
        if (deps.busy()) return;
        deps.say(state.line);
        state = QUIET;
    }
  };

  return {
    opened(line: LineDef | null): void {
      state = line === null ? QUIET : { kind: 'waiting', line };
      attempt();
    },
    update(): void {
      attempt();
    },
    closed(): void {
      state = QUIET;
    },
  };
}
