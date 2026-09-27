/**
 * Builds the state snapshot pushed to the Stream Deck plugin.
 * Takes `game` as an argument so it can be unit tested without Foundry.
 *
 * @param {Game} game
 * @returns {object} See docs/PROTOCOL.md ("state").
 */
export function collectState(game) {
  return {
    paused: Boolean(game.paused),
    volume: Number(game.settings.get("core", "globalPlaylistVolume") ?? 0),
    combat: collectCombat(game.combat),
    playlists: game.playlists.contents.map(collectPlaylist),
  };
}

function collectCombat(combat) {
  if (!combat) return null;

  const combatant = combat.started ? combat.combatant : null;

  return {
    id: combat.id,
    started: Boolean(combat.started),
    round: combat.round ?? 0,
    turn: combat.turn ?? null,
    combatant: combatant
      ? { id: combatant.id, name: combatant.name, img: combatant.img ?? null }
      : null,
    count: combat.turns?.length ?? 0,
  };
}

function collectPlaylist(playlist) {
  return {
    id: playlist.id,
    name: playlist.name,
    playing: Boolean(playlist.playing),
    mode: playlist.mode,
    sounds: playlist.sounds.contents.map((s) => ({
      id: s.id,
      name: s.name,
      playing: Boolean(s.playing),
      repeat: Boolean(s.repeat),
    })),
  };
}
