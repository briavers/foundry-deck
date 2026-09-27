# Foundry Deck wire protocol (v1)

Transport: WebSocket, UTF-8 JSON text frames, up to 1 MiB each. The Stream Deck
plugin listens on `ws://127.0.0.1:<port>` (default `17380`). The Foundry module
connects as a client from the GM's browser.

The port and the token are plugin-wide settings. You'll find them in the
**Foundry connection** section of any Foundry Deck key's settings in the Stream
Deck app. The Foundry module has matching **Stream Deck port** and **Stream
Deck token** settings.

Every message is an object with a `type` field.

## Authentication

1. On first run the plugin generates a random 24-character token and stores it
   in its global settings. Clearing the token field generates a new one.
2. The **first** message on a new connection must be a `hello` carrying that
   token. The plugin compares it in constant time.
3. A connection is closed with code **4001** (`unauthorized`) when:
   - its first message isn't a `hello` with the correct token, or
   - it sends nothing within 5 seconds.
   Until it's authenticated, a connection gets nothing from the plugin and
   doesn't affect the active client.
4. Once authenticated, the connection becomes the active client. Any previous
   client is closed with code **4000** (`replaced`).
5. When the token changes in the plugin, the active client is closed with
   **4001**.

The Foundry module doesn't reconnect after a 4000 or 4001 close. For 4001 it
shows an error until the token setting is fixed. After any other close it
reconnects with backoff from 1 s up to 30 s.

## Foundry → plugin

### `hello`

Sent right after the connection opens. It must be the first message.

```json
{ "type": "hello", "protocol": 1, "token": "Zk3v…", "module": "0.1.0", "foundry": "13.346", "world": "The Marked Five", "user": "Gamemaster" }
```

### `state`

A full snapshot. It's sent after `hello`, after any relevant Foundry hook
(debounced by about 100 ms), and in reply to `requestState`.

```json
{
  "type": "state",
  "state": {
    "paused": false,
    "volume": 0.5,
    "combat": {
      "id": "abc123",
      "started": true,
      "round": 3,
      "turn": 1,
      "combatant": { "id": "c1", "name": "Goblin Boss", "img": "tokens/goblin.webp" },
      "count": 6
    },
    "playlists": [
      {
        "id": "p1",
        "name": "Tavern",
        "playing": true,
        "mode": 0,
        "sounds": [
          { "id": "s1", "name": "Drunken Sailor", "playing": true, "repeat": false },
          { "id": "s2", "name": "Silent Night", "playing": false, "repeat": false }
        ]
      }
    ]
  }
}
```

- `combat` is `null` when no encounter is being viewed.
- `combatant` is `null` when there's an encounter but it hasn't started or is
  empty.
- `mode` uses `CONST.PLAYLIST_MODES`: `-1` disabled, `0` sequential,
  `1` shuffle, `2` simultaneous.
- `sounds` lists every track in the playlist, in no particular order.

### `result`

The reply to a `command`, matched by `id`.

```json
{ "type": "result", "id": "7", "ok": true }
{ "type": "result", "id": "8", "ok": false, "error": "No active combat" }
```

## Plugin → Foundry

### `command`

```json
{ "type": "command", "id": "7", "command": "combat.nextTurn", "params": {} }
```

| command                 | params                              | notes                                                  |
|-------------------------|-------------------------------------|--------------------------------------------------------|
| `combat.nextTurn`       | –                                   |                                                        |
| `combat.previousTurn`   | –                                   |                                                        |
| `combat.nextRound`      | –                                   |                                                        |
| `combat.previousRound`  | –                                   |                                                        |
| `combat.start`          | –                                   | Starts the encounter being viewed                      |
| `game.togglePause`      | `{ paused?: boolean }`              | Without `paused` it flips the current state            |
| `playlist.toggle`       | `{ playlistId }`                    | Plays one track if stopped, stops all if playing        |
| `playlist.play`         | `{ playlistId, soundId?, random? }` | Starts exactly one track, in every playback mode. Without `soundId`/`random`, resumes a paused track or starts the first one in the playlist's order |
| `playlist.stop`         | `{ playlistId }`                    |                                                        |
| `playlist.next`         | `{ playlistId? }`                   | Without an id: every playlist that's playing. Follows the playlist's own order regardless of mode |
| `playlist.previous`     | `{ playlistId? }`                   | Without an id: every playlist that's playing. Follows the playlist's own order regardless of mode |
| `playlist.stopAll`      | –                                   | Stops every playlist that's playing                    |
| `playlist.toggleRepeat` | `{ playlistId }`                    | Toggles repeat on the track currently playing in the playlist |
| `volume.adjust`         | `{ delta: number }`                 | Adds to `core.globalPlaylistVolume`, clamped to 0..1   |

### `requestState`

```json
{ "type": "requestState" }
```

Asks Foundry to send a fresh `state` right away.
