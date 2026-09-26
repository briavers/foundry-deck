/**
 * Maps protocol command names (docs/PROTOCOL.md) to Foundry API calls.
 * Each handler throws an Error with a readable message when it can't run;
 * the bridge turns that into a `{ ok: false, error }` result.
 *
 * @param {Game} game
 * @returns {Record<string, (params: object) => Promise<void>>}
 */
export function createCommands(game) {
  const combat = () => {
    if (!game.combat) throw new Error("No active combat encounter");
    return game.combat;
  };

  const startedCombat = () => {
    const c = combat();
    if (!c.started) throw new Error("Combat has not started");
    return c;
  };

  const playlist = (id) => {
    const p = id ? game.playlists.get(id) : null;
    if (!p) throw new Error(`Playlist not found: ${id ?? "(none)"}`);
    return p;
  };

  const playingPlaylists = () => game.playlists.contents.filter((p) => p.playing);

  /** Explicit playlist when given, otherwise everything that's currently playing. */
  const targetPlaylists = (id) => (id ? [playlist(id)] : playingPlaylists());

  const skip = async (id, direction) => {
    const targets = targetPlaylists(id);
    if (!targets.length) throw new Error("No playlist is playing");
    await Promise.all(targets.map((p) => p.playNext(null, { direction })));
  };

  return {
    "combat.nextTurn": async () => startedCombat().nextTurn(),
    "combat.previousTurn": async () => startedCombat().previousTurn(),
    "combat.nextRound": async () => startedCombat().nextRound(),
    "combat.previousRound": async () => startedCombat().previousRound(),
    "combat.start": async () => {
      const c = combat();
      if (c.started) throw new Error("Combat already started");
      await c.startCombat();
    },

    "game.togglePause": async ({ paused } = {}) => {
      const next = typeof paused === "boolean" ? paused : !game.paused;
      // v13 replaced the `push` boolean with an options object.
      if ((game.release?.generation ?? 0) >= 13) game.togglePause(next, { broadcast: true });
      else game.togglePause(next, true);
    },

    "playlist.toggle": async ({ playlistId } = {}) => {
      const p = playlist(playlistId);
      await (p.playing ? p.stopAll() : p.playAll());
    },
    "playlist.play": async ({ playlistId } = {}) => playlist(playlistId).playAll(),
    "playlist.stop": async ({ playlistId } = {}) => playlist(playlistId).stopAll(),
    "playlist.next": async ({ playlistId } = {}) => skip(playlistId, 1),
    "playlist.previous": async ({ playlistId } = {}) => skip(playlistId, -1),
    "playlist.stopAll": async () => {
      await Promise.all(playingPlaylists().map((p) => p.stopAll()));
    },

    "volume.adjust": async ({ delta } = {}) => {
      const step = Number(delta);
      if (!Number.isFinite(step)) throw new Error("volume.adjust requires a numeric delta");
      const current = Number(game.settings.get("core", "globalPlaylistVolume") ?? 0);
      const next = Math.min(1, Math.max(0, Math.round((current + step) * 100) / 100));
      await game.settings.set("core", "globalPlaylistVolume", next);
    },
  };
}
