# Handoff: status and next steps

State as of `master` @ `f4af485` plus this handoff commit.

## What works

Every part below is covered by automated tests. **Nothing has been tried yet
with a real Foundry world or a physical Stream Deck.**

- **Foundry module** (`foundry-module/`)
  - Only GM clients connect.
  - Reconnects with backoff from 1 s up to 30 s.
  - Stops for good after close code 4000 (replaced) or 4001 (bad token).
- **Commands**
  - Combat: next/previous turn, next/previous round, start.
  - Pause toggle.
  - Playlists: play/stop/toggle, next/previous track, stop all.
  - Global volume ±.
- **State push.** Whenever a relevant hook fires, the module sends a
  debounced snapshot: pause, volume, combat, playlists.
- **Stream Deck plugin** (`streamdeck-plugin/`): 11 key actions with live
  feedback.
  - Next Turn shows the combatant, Next Round shows `Rd N`.
  - Pause and Playlist Play/Stop have two states.
  - The volume key shows the current %.
  - The playlist dropdown is filled live from Foundry through the sdpi
    `datasource`.
- **Connection settings.**
  - The port (default 17380) and token are Stream Deck global settings, shown
    in the "Foundry connection" section of every key's settings.
  - Changing the port restarts the server live.
  - Clearing the token generates a new one.
- **Authentication.**
  - The first message must be a `hello` carrying the token, within 5 s. Wrong
    or missing tokens are closed with 4001.
  - The token is compared in constant time.
  - A connection that hasn't authenticated can't displace the active client.
- **Tests:** 20 `node:test` tests in the module and 25 vitest tests in the
  plugin, including an end-to-end test.

## First thing to do locally: a real smoke test

1. Install Node 24 and Stream Deck 7.1 or later. Then:

   ```bash
   npm install && npm run build
   cd streamdeck-plugin && npx streamdeck link com.briavers.foundry-deck.sdPlugin
   npm run watch
   ```

2. Symlink `foundry-module/` to `<FoundryData>/Data/modules/foundry-deck`.
   - Windows: `mklink /D "<FoundryData>\Data\modules\foundry-deck" "<repo>\foundry-module"`
   - Then enable the module in a test world.
3. Drag a Foundry Deck action onto a key and open its settings. Copy the token
   into *Configure Settings → Foundry Deck* in Foundry.
4. Check each of these in the real apps:
   - [ ] The "Foundry connection" section renders, and the port and token
     fields save. sdpi-components could not be downloaded in the cloud
     session, so this is untested.
   - [ ] The playlist dropdown fills in (the datasource request/response).
   - [ ] The Chromium "local network access" prompt appears when Foundry is
     opened over https. Accept it.
   - [ ] Pause and Playlist keys switch state correctly (`DisableAutomaticStates`).
   - [ ] Changing the port in Stream Deck and in Foundry reconnects.
   - [ ] Clearing the token disconnects Foundry and shows the error
     notification.
   - [ ] The Stream Deck app accepts SVG key images and action icons. The
     manifest validates, but they haven't been seen in the app.
5. Where to look when something fails:
   - Plugin logs: `streamdeck-plugin/com.briavers.foundry-deck.sdPlugin/logs/`
   - Debugger: the manifest sets `Debug: "enabled"`, so you can attach one.
   - Foundry: the browser console. `game.modules.get("foundry-deck").api`
     exposes `bridge` and `reconnect()`.

## Gotchas

- **The Elgato toolchain is newer than most examples online.**
  - The SDK is `@elgato/streamdeck` v3, with `SDKVersion: 3` in the manifest
    and Node 24.
  - The code follows the template shipped in `@elgato/cli` 1.10
    (`node_modules/@elgato/cli/template`). Trust that over older blog posts.
- **TypeScript is pinned to `~5.9`.** TypeScript 7, the native Go port, is the
  npm `latest` tag. `@rollup/plugin-typescript` needs the JS compiler API.
- **`@elgato/utils` is a direct dependency** because the SDK doesn't re-export
  the `JsonObject`/`JsonValue` types. Keep its version in line with the one the
  SDK depends on.
- **`plugin.ts` uses top-level `await`.** Global settings can only be read
  after `streamDeck.connect()`, so the server doesn't listen until they're
  applied.
- **Port writes.** `resolveSettings` never writes back a port the user typed,
  because the property inspector may save half-typed values. It only fills in
  the port on first run and stores newly generated tokens.
- **Plugin marketplace icon.** It must be PNG
  (`imgs/plugin/marketplace.png` and `@2x`). Those two were rendered once from
  `marketplace.svg` with Playwright, so re-render them if the SVG changes. All
  other images are SVG.
- **Test caveat.** `foundry-module/test/fakes.js` is a hand-written
  approximation of Foundry. If behaviour differs in real Foundry, fix the fake
  as well as the code.

## Next steps (roadmap)

1. **Smoke test** (above), then fix whatever it finds.
2. **Icons / key art.** Done: key images are now fantasy-style PNGs
   (`imgs/actions/<name>/key(-1)(@2x).png`, source renders in `assets/icons/`
   at the repo root), generated via the `dam` MCP server. The action-list
   glyphs in `scripts/generate-icons.mjs` are unchanged (still generated
   placeholders) since they need a flat white-on-transparent style, not full
   art. Optional ideas:
   - render the combatant's token image on the Next Turn key via
     `setImage` (`state.combat.combatant.img` is already sent);
   - show a "disconnected" look while `state === null`.
3. **Release packaging + CI.**
   - A GitHub Actions workflow that runs test, typecheck, build and validate
     on push.
   - A release workflow that:
     - runs `npm run pack -w streamdeck-plugin` to produce a
       `.streamDeckPlugin`;
     - runs `npm run package -w foundry-module` to build the zip;
     - attaches both files and `module.json` to a GitHub release.
     `module.json` already points `manifest`/`download` at
     `releases/latest/download/…`.
   - Keep the versions in sync: `module.json`, both `package.json` files,
     and the manifest `Version` (which uses 4 parts, e.g. `0.1.0.0`).
4. **Stream Deck+ dials** (optional; the MK.2 doesn't have them): volume and
   turn stepping via `onDialRotate`, plus `"Encoder"` in the manifest
   `Controllers`.
5. **Nice-to-haves:**
   - a key that shows the connection status;
   - playlist "cycle mode";
   - "end combat" with a confirmation;
   - Foundry v14 verification.
