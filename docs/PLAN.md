# Foundry Deck — plan

Control a Foundry VTT game session (combat tracker, pause, music) from an
Elgato Stream Deck MK.2 (15 keys).

## 1. Architecture

```
┌──────────────────────────┐   WebSocket (JSON)   ┌──────────────────────────────┐
│ Stream Deck app          │                      │ Browser / Foundry desktop app│
│  └─ Stream Deck plugin   │ ◀─────────────────── │  └─ Foundry module           │
│     (Node 24 process)    │   ws://127.0.0.1:    │     (GM client only)         │
│     WS *server*          │        17380         │     WS *client*              │
└──────────────────────────┘                      └──────────────────────────────┘
      key press ──▶ command ─────────────────────▶ game.combat.nextTurn() …
      key image ◀── state  ◀───────────────────── Foundry hooks (updateCombat, pauseGame …)
```

Why the plugin is the server:

- The Foundry module runs inside a browser tab, and a browser can't listen on
  a socket. It can only connect out.
- The Stream Deck plugin is a normal Node.js process on the GM's machine, so it
  can listen on `127.0.0.1`.
- MaterialDeck, the best-known existing Foundry ↔ Stream Deck integration,
  does the same thing (it uses a separate "Material Server").

Consequences:

- The Stream Deck and the GM's browser must be on **the same machine**. That's
  how it's normally set up: the Stream Deck is plugged into the GM's PC.
- This works whether Foundry is self-hosted, on The Forge, or anywhere else.
  The connection goes from the GM's browser to their own localhost, never to
  the Foundry server.
- Browsers treat `localhost`/`127.0.0.1` as a secure origin, so an `https://`
  Foundry page may open `ws://127.0.0.1`. Recent Chromium versions ask once
  for "local network access". Accept that prompt.

## 2. Repository layout (npm workspaces)

```
foundry-deck/
├─ package.json                 # workspaces: foundry-module, streamdeck-plugin
├─ docs/
│  ├─ PLAN.md                   # this file
│  └─ PROTOCOL.md               # wire protocol shared by both sides
├─ foundry-module/              # Foundry VTT module, plain ES modules, no build
│  ├─ module.json
│  ├─ lang/en.json
│  ├─ scripts/
│  │  ├─ main.js                # hooks + settings, wires everything together
│  │  ├─ bridge.js              # reconnecting WS client (no Foundry globals)
│  │  ├─ commands.js            # command name -> Foundry API call
│  │  └─ state.js               # snapshot of combat/pause/playlist state
│  └─ test/                     # node:test unit tests with a fake `game`
└─ streamdeck-plugin/           # Stream Deck plugin, TypeScript + rollup
   ├─ com.briavers.foundry-deck.sdPlugin/
   │  ├─ manifest.json
   │  ├─ imgs/                  # SVG key and action icons
   │  └─ ui/                    # property inspectors (sdpi-components)
   ├─ src/
   │  ├─ plugin.ts              # entry: start WS server, register actions
   │  ├─ bridge/                # WS server + protocol types
   │  └─ actions/               # one class per Stream Deck action
   └─ test/
```

The Foundry module has no build step, so the repo folder can be symlinked
straight into `Data/modules/`. The plugin uses the official Elgato toolchain
(`@elgato/cli`, rollup, TypeScript).

## 3. Features → Stream Deck actions

| Group  | Action              | Foundry call                               | Key feedback                      |
|--------|---------------------|--------------------------------------------|-----------------------------------|
| Combat | Next Turn           | `game.combat.nextTurn()`                   | Current combatant's name          |
| Combat | Previous Turn       | `game.combat.previousTurn()`               | –                                 |
| Combat | Next Round          | `game.combat.nextRound()`                  | `Rd N`                            |
| Combat | Previous Round      | `game.combat.previousRound()`              | –                                 |
| Combat | Start Combat        | `game.combat.startCombat()`                | –                                 |
| Game   | Pause / Unpause     | `game.togglePause(!paused, {broadcast})`   | 2 states: running / paused        |
| Music  | Playlist Play/Stop  | `playlist.playAll()` / `stopAll()`         | Playlist name + playing state     |
| Music  | Next Track          | `playlist.playNext(null, {direction: 1})`  | –                                 |
| Music  | Previous Track      | `playlist.playNext(null, {direction: -1})` | –                                 |
| Music  | Stop All Music      | `stopAll()` on every playing playlist      | –                                 |
| Music  | Volume Up / Down    | `core.globalPlaylistVolume` ± step         | Volume %                          |

Playlist actions have a property inspector with a dropdown. It's filled live
from Foundry, so you pick a playlist by name. The track-skip actions can
target one playlist or "whatever is playing".

A suggested 5×3 layout for the MK.2:

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ ◀ Turn  │ Turn ▶  │ ◀ Round │ Round ▶ │  Pause  │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ Tavern  │ Combat  │ Dungeon │  Boss   │ Stop all│   ← playlist toggles
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ ◀ Track │ Track ▶ │  Vol -  │  Vol +  │ Start ⚔ │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

## 4. Protocol

See [PROTOCOL.md](./PROTOCOL.md). In short: JSON messages with `type`
`hello` / `state` / `result` (Foundry → plugin) and `command` /
`requestState` (plugin → Foundry). Foundry pushes a full state snapshot,
debounced, whenever a relevant hook fires. The plugin repaints every visible
key from that snapshot.

## 5. Implementation phases

1. **Foundation** *(done)*
   - Monorepo, protocol doc, WS server in the plugin, WS client in the module.
   - Reconnect with backoff; only GM clients connect.
2. **Combat + pause** *(done)*
   - Five combat actions and the pause toggle, with live key feedback.
3. **Music** *(done)*
   - Playlist toggle with a live playlist dropdown, next/previous track,
     stop all, and volume.
4. **Connection settings + security** *(done)*
   - Plugin-wide port and token, in a "Foundry connection" section on every
     key's settings page (Stream Deck global settings). Changing the port
     restarts the server live.
   - Shared-token handshake: a random token is generated on first run and
     must be pasted into the Foundry module settings. Details in
     [PROTOCOL.md](./PROTOCOL.md#authentication).
5. **Polish** *(next)*
   - Custom key art. Right now keys use simple generated SVG icons.
   - Stream Deck+ dial support (volume, turns).
6. **Release** *(next)*
   - `streamdeck pack` to produce a `.streamDeckPlugin`.
   - A zipped module plus `module.json` manifest URL on GitHub releases.
   - A GitHub Actions workflow.

## 6. Local development

Foundry module:

```bash
# Link the module into your Foundry data folder (Windows: mklink /D)
ln -s "$PWD/foundry-module" "<FoundryData>/Data/modules/foundry-deck"
npm test -w foundry-module
```

Enable **Foundry Deck** in your world. Open any Foundry Deck key's settings
in the Stream Deck app, then copy the **Token** (and the **Port**, if you
changed it) into *Game Settings → Configure Settings → Foundry Deck*. After
that it connects automatically when a GM logs in.

Stream Deck plugin. It needs Node 24 and Stream Deck 7.1+:

```bash
npm install
npm run build -w streamdeck-plugin
npx streamdeck link streamdeck-plugin/com.briavers.foundry-deck.sdPlugin
npm run watch -w streamdeck-plugin   # rebuild + restart plugin on change
```

## 7. Risks / open questions

- **Several GM tabs open.** The plugin talks to the most recently connected
  client, and older sockets are closed with a reason. The module doesn't
  auto-reconnect after being replaced, so two tabs won't fight over the
  connection.
- **Foundry v14.** The module targets v13 (minimum v12). Every API used is
  stable across versions, and the v12/v13 `togglePause` signature difference
  is handled. Re-verify on v14.
- **Security.** Several layers:
  - The server only listens on loopback, so other machines can't reach it.
  - Any web page open in the GM's browser could try to connect to
    localhost. Without the token, it's closed before it can see or send
    anything.
  - Even an authenticated client can only push state for the keys to show.
    The plugin never runs code it receives.
  - The token is stored in Stream Deck's plugin settings and Foundry's
    client-side settings, both on the GM's machine.
