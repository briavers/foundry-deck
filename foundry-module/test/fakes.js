/** Minimal stand-ins for the Foundry objects the module touches. */

class FakeCollection {
  constructor(items = []) {
    this.contents = items;
  }

  get(id) {
    return this.contents.find((i) => i.id === id);
  }
}

export function fakePlaylist({ id, name = id, playing = false, mode = 0, sounds = [] }) {
  const calls = [];
  return {
    id,
    name,
    playing,
    mode,
    sounds: new FakeCollection(sounds),
    calls,
    async playAll() { calls.push(["playAll"]); this.playing = true; },
    async stopAll() { calls.push(["stopAll"]); this.playing = false; },
    async playNext(soundId, options) { calls.push(["playNext", soundId, options]); },
  };
}

export function fakeCombat({ started = true, round = 1, turn = 0, combatants = [] } = {}) {
  const calls = [];
  const record = (name) => async () => { calls.push(name); };
  return {
    id: "combat1",
    started,
    round,
    turn,
    turns: combatants,
    get combatant() { return this.turns[this.turn] ?? null; },
    calls,
    nextTurn: record("nextTurn"),
    previousTurn: record("previousTurn"),
    nextRound: record("nextRound"),
    previousRound: record("previousRound"),
    async startCombat() { calls.push("startCombat"); this.started = true; },
  };
}

export function fakeGame({ paused = false, volume = 0.5, combat = null, playlists = [], generation = 13 } = {}) {
  const settings = new Map([["core.globalPlaylistVolume", volume]]);
  const pauseCalls = [];
  return {
    paused,
    combat,
    playlists: new FakeCollection(playlists),
    release: { generation },
    pauseCalls,
    togglePause(pause, options) { pauseCalls.push([pause, options]); this.paused = pause; },
    settings: {
      get: (ns, key) => settings.get(`${ns}.${key}`),
      set: async (ns, key, value) => { settings.set(`${ns}.${key}`, value); },
    },
  };
}
