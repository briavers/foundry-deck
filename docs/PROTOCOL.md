# Foundry Deck wire protocol (v1)

Transport: WebSocket, UTF-8 JSON text frames. The Stream Deck plugin listens on
`ws://127.0.0.1:17380`. The port can be changed with the
`FOUNDRY_DECK_PORT` environment variable on the plugin side and the **Stream
Deck URL** module setting on the Foundry side. The Foundry module connects as a
client from the GM's browser.

Every message is an object with a `type` field.

## Foundry → plugin

### `hello`

Sent right after the connection opens.

```json
{ "type": "hello", "protocol": 1, "module": "0.1.0", "foundry": "13.346", "world": "The Marked Five", "user": "Gamemaster" }
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
      { "id": "p1", "name": "Tavern", "playing": true, "mode": 0, "tracks": ["Drunken Sailor"] }
    ]
  }
}
```

- `combat` is `null` when no encounter is being viewed.
- `combatant` is `null` when there's an encounter but it hasn't started or is
  empty.
- `mode` uses `CONST.PLAYLIST_MODES`: `-1` disabled, `0` sequential,
  `1` shuffle, `2` simultaneous.
- `tracks` lists the names of the sounds that are currently playing.

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
| `playlist.toggle`       | `{ playlistId }`                    | Plays all if stopped, stops all if playing             |
| `playlist.play`         | `{ playlistId }`                    |                                                        |
| `playlist.stop`         | `{ playlistId }`                    |                                                        |
| `playlist.next`         | `{ playlistId? }`                   | Without an id: every playlist that's playing           |
| `playlist.previous`     | `{ playlistId? }`                   | Without an id: every playlist that's playing           |
| `playlist.stopAll`      | –                                   | Stops every playlist that's playing                    |
| `volume.adjust`         | `{ delta: number }`                 | Adds to `core.globalPlaylistVolume`, clamped to 0..1   |

### `requestState`

```json
{ "type": "requestState" }
```

Asks Foundry to send a fresh `state` right away.
