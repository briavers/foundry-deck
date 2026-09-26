import { test } from "node:test";
import assert from "node:assert/strict";

import { collectState } from "../scripts/state.js";
import { fakeCombat, fakeGame, fakePlaylist } from "./fakes.js";

test("collectState without combat or playlists", () => {
  assert.deepEqual(collectState(fakeGame({ paused: true, volume: 0.4 })), {
    paused: true,
    volume: 0.4,
    combat: null,
    playlists: [],
  });
});

test("collectState reports the current combatant of a started combat", () => {
  const combat = fakeCombat({
    round: 3,
    turn: 1,
    combatants: [
      { id: "a", name: "Aria", img: "a.webp" },
      { id: "b", name: "Goblin Boss", img: "b.webp" },
    ],
  });

  assert.deepEqual(collectState(fakeGame({ combat })).combat, {
    id: "combat1",
    started: true,
    round: 3,
    turn: 1,
    combatant: { id: "b", name: "Goblin Boss", img: "b.webp" },
    count: 2,
  });
});

test("collectState hides the combatant before combat starts", () => {
  const combat = fakeCombat({ started: false, round: 0, combatants: [{ id: "a", name: "Aria" }] });
  assert.equal(collectState(fakeGame({ combat })).combat.combatant, null);
});

test("collectState lists playlists with their playing tracks", () => {
  const playlist = fakePlaylist({
    id: "tavern",
    name: "Tavern",
    playing: true,
    mode: 1,
    sounds: [
      { name: "Drunken Sailor", playing: true },
      { name: "Silent Night", playing: false },
    ],
  });

  assert.deepEqual(collectState(fakeGame({ playlists: [playlist] })).playlists, [
    { id: "tavern", name: "Tavern", playing: true, mode: 1, tracks: ["Drunken Sailor"] },
  ]);
});
