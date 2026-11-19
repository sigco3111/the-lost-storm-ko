# Contributing

Thank you for looking. Bug reports, ideas and pull requests are all welcome.

## Report a bug or suggest something

Open an issue. For a bug, say what you did, what you expected and what happened, and which browser and device you played on. For questions and talk about the game, use the [Discord](https://discord.gg/XTRePF4HJs). For a security problem, do not open an issue: see [SECURITY.md](SECURITY.md).

## Run it

You need Node 22.18 or later (CI uses Node 22).

```bash
npm install
npm run dev
```

The game is at http://localhost:5193/play/. A plain clone runs offline and silent: it makes no network request, and the parts that need a server (cloud save, the Hideout, chat, trading, the ladder) are absent. [README.md](README.md) says how the code is laid out.

## Before a pull request

All three must pass with zero errors and zero warnings:

```bash
npm run typecheck
npm run lint
npm run test:affected
```

`npm run test:affected` runs only the tests your branch can reach, in a few seconds. `npm test` runs the whole suite; run it after changing configuration, the lockfile or shared test support.

Every change lands through a pull request. Nobody pushes to `main`.

## House rules

[AGENTS.md](AGENTS.md) is the full list. The ones that catch people most often:

- **No comments in code.** Names, types and tests carry the meaning; the why goes in the commit or the pull request. `test/rules.test.ts` enforces it.
- **Strict TypeScript.** Explicit return types, no `any`, no casts, no non-null `!`, no `@ts-` directives, no lint suppressions.
- **Game logic lives in `sim/`, drawing in `src/`.** `sim/` never imports Three.js or touches the DOM, and it is tested in Node. A change to damage, skills, monsters, loot or levelling goes in `sim/` with a test.
- **Content is data.** Monsters, skills, items, zones and the skill tree are JSON in `data/`. Extend the schema in `sim/content/` in a general way rather than special-casing an id.
- **Tests sit beside the file they test** (`foo.ts`, `foo.test.ts`), never start a server, a browser or a process, and never wait on real time.
- **No browser-native controls.** No `<select>`, `alert`, native pickers or `title` tooltips; the HUD draws its own.
- **Motion, not swaps.** Every visible change in the HUD animates with the `--spring-*` tokens in `src/hud/hud.css`.

## Assets

Every file must be redistributable: CC0, or CC BY with full attribution. Add a row to [ASSETS.md](ASSETS.md) with the source and licence, and the licence text to `licenses/`. Never commit Mixamo, Splice, store-bought or ripped files; keep local-only assets in `public/models/local/` or `public/audio/local/`, which are git-ignored.

## Licence

By contributing you agree that your contribution is released under the [MIT licence](LICENSE) of this repository.
