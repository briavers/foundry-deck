/** Minimal stand-ins for the Foundry objects the module touches. */

class FakeCollection {
  constructor(items = []) {
    this.contents = items;
  }

  get(id) {
    return this.contents.find((i) => i.id === id);
  }
}

export function fakePlaylist({ id, name = id, playing = false, mode = 0, sounds = [], playbackOrder } = {}) {
  const calls = [];
  const soundList = sounds.map((s) => ({ id: s.name, repeat: false, pausedTime: null, playing: false, ...s }));
  return {
    id,
    name,
    playing,
    mode,
    sounds: new FakeCollection(soundList),
    get playbackOrder() { return playbackOrder ?? soundList.map((s) => s.id); },
    calls,
    async playAll() { calls.push(["playAll"]); this.playing = true; },
    async stopAll() {
      calls.push(["stopAll"]);
      this.playing = false;
      for (const s of soundList) s.playing = false;
    },
    async playNext(soundId, options) { calls.push(["playNext", soundId, options]); },
    async update(data) {
      calls.push(["update", data]);
      if ("playing" in data) this.playing = data.playing;
      if (Array.isArray(data.sounds)) {
        for (const patch of data.sounds) {
          const s = soundList.find((x) => x.id === patch._id);
          if (s) Object.assign(s, patch);
        }
      }
    },
    async updateEmbeddedDocuments(_type, updates) {
      calls.push(["updateEmbeddedDocuments", _type, updates]);
      for (const patch of updates) {
        const s = soundList.find((x) => x.id === patch._id);
        if (s) Object.assign(s, patch);
      }
    },
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
