import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { FoundryBridge } from "../src/bridge/foundry-bridge";
import { CLOSE_REPLACED, type FoundryState } from "../src/bridge/protocol";

const state: FoundryState = { paused: true, volume: 0.5, combat: null, playlists: [] };

function connect(port: number): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(`ws://127.0.0.1:${port}`);
		socket.once("open", () => resolve(socket));
		socket.once("error", reject);
	});
}

function nextMessage(socket: WebSocket): Promise<any> {
	return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("FoundryBridge", () => {
	let bridge: FoundryBridge;

	beforeEach(async () => {
		bridge = new FoundryBridge({ port: 0, timeoutMs: 200 });
		await bridge.start();
	});

	afterEach(async () => {
		await bridge.stop();
	});

	it("tracks hello and state from Foundry", async () => {
		const events: unknown[] = [];
		bridge.on("connection", (connected) => events.push(connected));
		bridge.on("state", (s) => events.push(s));

		const socket = await connect(bridge.port);
		socket.send(JSON.stringify({ type: "hello", protocol: 1, world: "Test", user: "GM" }));
		socket.send(JSON.stringify({ type: "state", state }));
		await flush();

		expect(bridge.connected).toBe(true);
		expect(bridge.hello?.world).toBe("Test");
		expect(bridge.state).toEqual(state);

		socket.close();
		await flush();

		expect(bridge.connected).toBe(false);
		expect(bridge.state).toBeNull();
		expect(events).toEqual([true, state, false, null]);
	});

	it("resolves and rejects commands from Foundry's results", async () => {
		const socket = await connect(bridge.port);
		await flush();

		const ok = bridge.send("combat.nextTurn", {});
		const okMessage = await nextMessage(socket);
		expect(okMessage).toMatchObject({ type: "command", command: "combat.nextTurn", params: {} });
		socket.send(JSON.stringify({ type: "result", id: okMessage.id, ok: true }));
		await expect(ok).resolves.toBeUndefined();

		const failed = bridge.send("playlist.toggle", { playlistId: "x" });
		const failMessage = await nextMessage(socket);
		socket.send(JSON.stringify({ type: "result", id: failMessage.id, ok: false, error: "Playlist not found: x" }));
		await expect(failed).rejects.toThrow("Playlist not found: x");

		socket.close();
	});

	it("rejects commands when Foundry is offline or silent", async () => {
		await expect(bridge.send("combat.nextTurn", {})).rejects.toThrow("not connected");

		const socket = await connect(bridge.port);
		await flush();
		await expect(bridge.send("combat.nextTurn", {})).rejects.toThrow("did not answer");
		socket.close();
	});

	it("replaces the previous Foundry client with the newest one", async () => {
		const first = await connect(bridge.port);
		const closed = new Promise<number>((resolve) => first.once("close", (code) => resolve(code)));

		const second = await connect(bridge.port);
		expect(await closed).toBe(CLOSE_REPLACED);

		const pending = bridge.send("game.togglePause", {});
		const message = await nextMessage(second);
		expect(message.command).toBe("game.togglePause");
		second.send(JSON.stringify({ type: "result", id: message.id, ok: true }));
		await expect(pending).resolves.toBeUndefined();

		second.close();
	});
});
