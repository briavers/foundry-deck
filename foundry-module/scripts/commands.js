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

  /**
   * Picks one Sound from a playlist: a specific one, a random one, or (by default) the
   * next one in the playlist's own playback order, resuming a paused sound if there is one.
   */
  const pickSound = (p, { soundId, random } = {}) => {
    const sounds = p.sounds.contents;
    if (!sounds.length) throw new Error(`Playlist has no tracks: ${p.name}`);
    if (soundId) {
      const s = p.sounds.get(soundId);
      if (!s) throw new Error(`Track not found: ${soundId}`);
      return s;
    }
    if (random) return sounds[Math.floor(Math.random() * sounds.length)];
    const order = p.playbackOrder ?? sounds.map((s) => s.id);
    const paused = sounds.find((s) => s.pausedTime);
    return p.sounds.get(paused?.id ?? order[0]) ?? sounds[0];
  };

  /**
   * Plays exactly one Sound in a playlist, pausing every other one. Unlike
   * Playlist#playAll(), this behaves the same in every playback mode, including
   * Simultaneous (where playAll() would otherwise start every track at once).
   */
  const playOneSound = async (p, opts) => {
    const sound = pickSound(p, opts);
    await p.update({
      playing: true,
      sounds: p.sounds.contents.map((s) => ({
        _id: s.id,
        playing: s.id === sound.id,
        pausedTime: s.id === sound.id ? s.pausedTime : null,
      })),
    });
  };

  const skip = async (id, direction) => {
    const targets = targetPlaylists(id);
    if (!targets.length) throw new Error("No playlist is playing");
    await Promise.all(
      targets.map((p) => {
        const sounds = p.sounds.contents;
        if (!sounds.length) return null;
        const order = p.playbackOrder ?? sounds.map((s) => s.id);
        const current = sounds.find((s) => s.playing);
        const from = current ? order.indexOf(current.id) : direction === 1 ? -1 : 0;
        const nextId = order[(from + direction + order.length) % order.length];
        return playOneSound(p, { soundId: nextId });
      }),
    );
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
      await (p.playing ? p.stopAll() : playOneSound(p, {}));
    },
    "playlist.play": async ({ playlistId, soundId, random } = {}) => playOneSound(playlist(playlistId), { soundId, random }),
    "playlist.stop": async ({ playlistId } = {}) => playlist(playlistId).stopAll(),
    "playlist.next": async ({ playlistId } = {}) => skip(playlistId, 1),
    "playlist.previous": async ({ playlistId } = {}) => skip(playlistId, -1),
    "playlist.stopAll": async () => {
      await Promise.all(playingPlaylists().map((p) => p.stopAll()));
    },
    "playlist.toggleRepeat": async ({ playlistId } = {}) => {
      const p = playlist(playlistId);
      const playing = p.sounds.contents.filter((s) => s.playing);
      if (!playing.length) throw new Error("No track is playing");
      const next = !playing[0].repeat;
      await p.updateEmbeddedDocuments(
        "PlaylistSound",
        playing.map((s) => ({ _id: s.id, repeat: next })),
      );
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
