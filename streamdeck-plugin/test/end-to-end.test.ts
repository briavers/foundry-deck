/**
 * Runs the real Foundry module bridge (foundry-module/scripts) against the real plugin
 * server, with a fake `game`, to prove both halves speak the same protocol.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// @ts-expect-error -- plain JS module from the sibling workspace
import { DeckBridge } from "../../foundry-module/scripts/bridge.js";
// @ts-expect-error -- plain JS module from the sibling workspace
import { createCommands } from "../../foundry-module/scripts/commands.js";
// @ts-expect-error -- plain JS module from the sibling workspace
import { collectState } from "../../foundry-module/scripts/state.js";
// @ts-expect-error -- plain JS test helpers from the sibling workspace
import { fakeCombat, fakeGame, fakePlaylist } from "../../foundry-module/test/fakes.js";
import { FoundryBridge } from "../src/bridge/foundry-bridge";
import type { FoundryState } from "../src/bridge/protocol";

const waitFor = async (check: () => boolean, timeoutMs = 1_000) => {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error("timed out");
		await new Promise((r) => setTimeout(r, 5));
	}
};

describe("Foundry module ↔ Stream Deck plugin", () => {
	let server: FoundryBridge;
	let client: InstanceType<typeof DeckBridge>;
	let game: ReturnType<typeof fakeGame>;

	beforeEach(async () => {
		server = new FoundryBridge({ port: 0 });
		await server.start();

		game = fakeGame({
			combat: fakeCombat({ round: 2, turn: 0, combatants: [{ id: "a", name: "Aria" }] }),
			playlists: [fakePlaylist({ id: "tavern", name: "Tavern" })],
		});

		client = new DeckBridge({
			url: `ws://127.0.0.1:${server.port}`,
			commands: createCommands(game),
			getState: () => collectState(game),
			hello: () => ({ world: "E2E", user: "GM" }),
			WebSocket: globalThis.WebSocket,
			debounceMs: 1,
		});
		client.connect();
		await waitFor(() => server.state !== null);
	});

	afterEach(async () => {
		client.disconnect();
		await server.stop();
	});

	it("receives hello and the initial state", () => {
		expect(server.hello).toMatchObject({ protocol: 1, world: "E2E", user: "GM" });
		expect(server.state?.combat).toMatchObject({ round: 2, combatant: { name: "Aria" } });
		expect(server.state?.playlists).toEqual([{ id: "tavern", name: "Tavern", playing: false, mode: 0, tracks: [] }]);
	});

	it("runs commands in Foundry and sees the resulting state", async () => {
		await server.send("combat.nextTurn", {});
		expect(game.combat.calls).toEqual(["nextTurn"]);

		await server.send("game.togglePause", {});
		await server.send("playlist.toggle", { playlistId: "tavern" });
		client.syncState();

		await waitFor(() => server.state?.paused === true && server.state.playlists[0].playing);
		const state = server.state as FoundryState;
		expect(state.paused).toBe(true);
		expect(state.playlists[0].playing).toBe(true);
	});

	it("surfaces Foundry-side errors to the plugin", async () => {
		await expect(server.send("playlist.toggle", { playlistId: "missing" })).rejects.toThrow("Playlist not found: missing");
	});
});
