import { test } from "node:test";
import assert from "node:assert/strict";

import { createCommands } from "../scripts/commands.js";
import { fakeCombat, fakeGame, fakePlaylist } from "./fakes.js";

test("combat commands call the matching Combat method", async () => {
  const combat = fakeCombat();
  const commands = createCommands(fakeGame({ combat }));

  await commands["combat.nextTurn"]();
  await commands["combat.previousTurn"]();
  await commands["combat.nextRound"]();
  await commands["combat.previousRound"]();

  assert.deepEqual(combat.calls, ["nextTurn", "previousTurn", "nextRound", "previousRound"]);
});

test("combat commands fail without an encounter or before it starts", async () => {
  await assert.rejects(createCommands(fakeGame())["combat.nextTurn"](), /No active combat/);

  const commands = createCommands(fakeGame({ combat: fakeCombat({ started: false }) }));
  await assert.rejects(commands["combat.nextTurn"](), /not started/);
});

test("combat.start only starts an unstarted encounter", async () => {
  const combat = fakeCombat({ started: false });
  const commands = createCommands(fakeGame({ combat }));

  await commands["combat.start"]();
  assert.deepEqual(combat.calls, ["startCombat"]);
  await assert.rejects(commands["combat.start"](), /already started/);
});

test("game.togglePause flips the state and broadcasts (v13 signature)", async () => {
  const game = fakeGame({ paused: false });
  const commands = createCommands(game);

  await commands["game.togglePause"]();
  await commands["game.togglePause"]();
  await commands["game.togglePause"]({ paused: true });

  assert.deepEqual(game.pauseCalls, [
    [true, { broadcast: true }],
    [false, { broadcast: true }],
    [true, { broadcast: true }],
  ]);
});

test("game.togglePause uses the legacy push flag on v12", async () => {
  const game = fakeGame({ generation: 12 });
  await createCommands(game)["game.togglePause"]();
  assert.deepEqual(game.pauseCalls, [[true, true]]);
});

test("playlist.toggle plays a stopped playlist and stops a playing one", async () => {
  const tavern = fakePlaylist({ id: "tavern", sounds: [{ id: "s1" }, { id: "s2" }] });
  const commands = createCommands(fakeGame({ playlists: [tavern] }));

  await commands["playlist.toggle"]({ playlistId: "tavern" });
  assert.deepEqual(tavern.calls, [
    [
      "update",
      {
        playing: true,
        sounds: [
          { _id: "s1", playing: true, pausedTime: null },
          { _id: "s2", playing: false, pausedTime: null },
        ],
      },
    ],
  ]);

  await commands["playlist.toggle"]({ playlistId: "tavern" });
  assert.deepEqual(tavern.calls[1], ["stopAll"]);

  await assert.rejects(commands["playlist.toggle"]({ playlistId: "nope" }), /not found/);
});

test("playlist.play always starts exactly one track, even in Simultaneous mode", async () => {
  const tavern = fakePlaylist({ id: "tavern", mode: 2, sounds: [{ id: "s1" }, { id: "s2" }] });
  const commands = createCommands(fakeGame({ playlists: [tavern] }));

  await commands["playlist.play"]({ playlistId: "tavern", soundId: "s2" });

  assert.deepEqual(tavern.calls, [
    [
      "update",
      {
        playing: true,
        sounds: [
          { _id: "s1", playing: false, pausedTime: null },
          { _id: "s2", playing: true, pausedTime: null },
        ],
      },
    ],
  ]);
});

test("playlist.play picks a random track when asked", async () => {
  const tavern = fakePlaylist({ id: "tavern", sounds: [{ id: "s1" }] });
  const commands = createCommands(fakeGame({ playlists: [tavern] }));

  await commands["playlist.play"]({ playlistId: "tavern", random: true });

  assert.equal(tavern.calls[0][1].sounds.find((s) => s._id === "s1").playing, true);
});

test("playlist.play rejects an unknown track", async () => {
  const tavern = fakePlaylist({ id: "tavern", sounds: [{ id: "s1" }] });
  const commands = createCommands(fakeGame({ playlists: [tavern] }));
  await assert.rejects(commands["playlist.play"]({ playlistId: "tavern", soundId: "nope" }), /Track not found/);
});

test("playlist.next/previous target the given playlist or everything playing, following playback order", async () => {
  const tavern = fakePlaylist({ id: "tavern", playing: true, sounds: [{ id: "s1", playing: true }, { id: "s2" }] });
  const boss = fakePlaylist({ id: "boss", playing: false, sounds: [{ id: "b1" }, { id: "b2", playing: true }] });
  const commands = createCommands(fakeGame({ playlists: [tavern, boss] }));

  await commands["playlist.next"]();
  await commands["playlist.previous"]({ playlistId: "boss" });

  assert.equal(tavern.sounds.get("s2").playing, true);
  assert.equal(tavern.sounds.get("s1").playing, false);
  assert.equal(boss.sounds.get("b1").playing, true);
  assert.equal(boss.sounds.get("b2").playing, false);
});

test("playlist.next without a target fails when nothing plays", async () => {
  const commands = createCommands(fakeGame({ playlists: [fakePlaylist({ id: "a" })] }));
  await assert.rejects(commands["playlist.next"](), /No playlist is playing/);
});

test("playlist.toggleRepeat flips repeat on the currently playing track", async () => {
  const tavern = fakePlaylist({ id: "tavern", sounds: [{ id: "s1", playing: true }, { id: "s2" }] });
  const commands = createCommands(fakeGame({ playlists: [tavern] }));

  await commands["playlist.toggleRepeat"]({ playlistId: "tavern" });
  assert.equal(tavern.sounds.get("s1").repeat, true);

  await commands["playlist.toggleRepeat"]({ playlistId: "tavern" });
  assert.equal(tavern.sounds.get("s1").repeat, false);

  await assert.rejects(
    commands["playlist.toggleRepeat"]({ playlistId: "tavern-none" }),
    /not found/,
  );
});

test("playlist.toggleRepeat fails when nothing is playing", async () => {
  const tavern = fakePlaylist({ id: "tavern", sounds: [{ id: "s1" }] });
  const commands = createCommands(fakeGame({ playlists: [tavern] }));
  await assert.rejects(commands["playlist.toggleRepeat"]({ playlistId: "tavern" }), /No track is playing/);
});

test("playlist.stopAll stops only playing playlists", async () => {
  const a = fakePlaylist({ id: "a", playing: true });
  const b = fakePlaylist({ id: "b", playing: false });
  await createCommands(fakeGame({ playlists: [a, b] }))["playlist.stopAll"]();

  assert.deepEqual(a.calls, [["stopAll"]]);
  assert.deepEqual(b.calls, []);
});

test("volume.adjust clamps to 0..1 and rounds to whole percents", async () => {
  const game = fakeGame({ volume: 0.95 });
  const commands = createCommands(game);

  await commands["volume.adjust"]({ delta: 0.1 });
  assert.equal(game.settings.get("core", "globalPlaylistVolume"), 1);

  await commands["volume.adjust"]({ delta: -0.33 });
  assert.equal(game.settings.get("core", "globalPlaylistVolume"), 0.67);

  await assert.rejects(commands["volume.adjust"]({}), /numeric delta/);
});
