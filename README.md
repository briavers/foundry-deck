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
`<FoundryData>/Data/modules/foundry-deck` and enable **Foundry Deck** in your
world.

**Pair them.**

1. In the Stream Deck app, drag any Foundry Deck action onto a key and open
   its settings.
2. The **Foundry connection** section shows the **Port** (default `17380`) and
   a generated **Token**.
3. In Foundry, go to *Game Settings → Configure Settings → Foundry Deck*,
   paste the token, and set the same port.

You'll see *"Foundry Deck: connected to Stream Deck."* when it connects. The
Stream Deck must be plugged into the same computer as the GM's browser.
