# Foundry Deck

Control a Foundry VTT session (combat tracker, pause, music) from an Elgato
Stream Deck. The repo is an npm-workspaces monorepo with two halves that talk
over a local WebSocket:

- `foundry-module/`: a Foundry VTT module in plain ES modules with **no build
  step**. It runs in the GM's browser as a WebSocket **client**.
- `streamdeck-plugin/`: a Stream Deck plugin (`@elgato/streamdeck` SDK v3,
  TypeScript, rollup). It runs as a Node 24 process and is the WebSocket
  **server** on `127.0.0.1`.

Read these before changing behaviour:

- `docs/PLAN.md`: architecture, roadmap, risks
- `docs/PROTOCOL.md`: the wire protocol. Both sides must follow it.
- `docs/HANDOFF.md`: current status, gotchas, next steps

## Commands

Run from the repo root unless noted:

```bash
npm install
npm test                                   # both workspaces
npm test -w foundry-module                 # node:test, zero dependencies
npm test -w streamdeck-plugin              # vitest (includes end-to-end test)
npm run typecheck -w streamdeck-plugin     # tsc --noEmit
npm run build                              # rollup -> *.sdPlugin/bin/plugin.js
npm run validate -w streamdeck-plugin      # streamdeck validate (manifest/files)
npm run icons -w streamdeck-plugin         # regenerate SVG icons
npm run watch -w streamdeck-plugin         # rebuild + restart plugin in Stream Deck
```

Before committing, run `npm test`, typecheck, build, and validate. All four
should pass.

## Conventions

- **Protocol changes touch both sides.** Update all of these together:
  - `docs/PROTOCOL.md`
  - `streamdeck-plugin/src/bridge/protocol.ts`, which holds the types and
    close codes
  - the matching files in `foundry-module/scripts/`, which duplicate
    `CLOSE_*` and `PROTOCOL_VERSION`
  - `streamdeck-plugin/test/end-to-end.test.ts`, which runs the real module
    code against the real server
- **Foundry module:**
  - Plain JS with JSDoc and 2-space indent.
  - `bridge.js`, `commands.js` and `state.js` must not touch Foundry globals.
    They get `game` and `WebSocket` injected, so they stay testable under
    Node with `test/fakes.js`.
  - Only `main.js` uses `game`, `Hooks`, `ui`, etc.
- **Adding a Foundry command:**
  1. Add a handler in `foundry-module/scripts/commands.js`.
  2. Add its params to `CommandParams` in `protocol.ts`.
  3. Add a row to the command table in `PROTOCOL.md`.
  4. Add tests in `foundry-module/test/commands.test.js`.
- **Stream Deck plugin:**
  - TypeScript with tab indent. The style matches the Elgato CLI template.
  - Settings types must be `type` aliases, not interfaces, because they have
    to satisfy `JsonObject`.
- **Adding a key action:**
  1. Subclass `FoundryAction` (`src/actions/foundry-action.ts`) and implement
     `command()`. Implement `render()` too if the key shows state.
  2. Decorate the class with `@action({ UUID: "com.briavers.foundry-deck.<name>" })`.
  3. Register it in `src/plugin.ts`.
  4. Add it to `com.briavers.foundry-deck.sdPlugin/manifest.json`.
  5. Add its icons in `scripts/generate-icons.mjs`, then run `npm run icons`.
- **Property inspectors (`*.sdPlugin/ui/*.html`):**
  - They use sdpi-components v4 from its CDN, with HTML attributes only.
  - Every page must contain the identical "Foundry connection" block, which
    holds the global `port` and `token` settings.
  - An action with no page of its own falls back to `ui/connection.html`,
    which the manifest sets as the top-level `PropertyInspectorPath`.
- **Foundry compatibility:** minimum v12, verified v13. Branch on
  `game.release.generation` where the APIs differ. `game.togglePause` is the
  only such case so far.
- Never commit `*.sdPlugin/bin`, `*.sdPlugin/logs`, `dist/` or `*.zip`. They
  are gitignored.
