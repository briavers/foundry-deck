# Foundry Deck

Control a Foundry VTT session from an Elgato Stream Deck:

- **Combat tracker:** next/previous turn, next/previous round, start combat.
  The keys show the current combatant and round.
- **Pause:** toggle the game pause. The key shows whether the game is paused.
- **Music:** play/stop specific playlists, skip tracks, stop all music, and
  change the volume. Playlist keys show the playlist name and whether it's
  playing.

This repo has two parts that talk over a local WebSocket:

| Folder                                   | What                                                   |
|------------------------------------------|--------------------------------------------------------|
| [`foundry-module/`](foundry-module)      | Foundry VTT module (v12–v13), plain ES modules         |
| [`streamdeck-plugin/`](streamdeck-plugin) | Stream Deck plugin (SDK v3, Node 24, TypeScript)      |

See [docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap, and
[docs/PROTOCOL.md](docs/PROTOCOL.md) for the message format.

## Quick start (development)

```bash
npm install
npm test                                  # both workspaces
npm run build                             # builds the Stream Deck plugin
```

**Stream Deck.** You need the Stream Deck app 7.1 or later.

```bash
cd streamdeck-plugin
npx streamdeck link com.briavers.foundry-deck.sdPlugin
npm run watch          # rebuilds and restarts the plugin when you change code
```

**Foundry.** Symlink or copy `foundry-module/` to
`<FoundryData>/Data/modules/foundry-deck`. Enable **Foundry Deck** in your
world and log in as a GM. You'll see *"Foundry Deck: connected to Stream
Deck."* when it connects.

The plugin listens on `ws://127.0.0.1:17380`. The Stream Deck must be plugged
into the same computer as the GM's browser.
