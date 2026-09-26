import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { FoundryBridge } from "../src/bridge/foundry-bridge";
import { CLOSE_REPLACED, CLOSE_UNAUTHORIZED, type FoundryState } from "../src/bridge/protocol";

const TOKEN = "s3cret-token";
const state: FoundryState = { paused: true, volume: 0.5, combat: null, playlists: [] };

type TestSocket = WebSocket & { closed: Promise<number> };

/** Opens a socket; `closed` is captured up front so fast server-side closes aren't missed. */
function connect(port: number): Promise<TestSocket> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(`ws://127.0.0.1:${port}`);
		const closed = new Promise<number>((r) => socket.once("close", (code) => r(code)));
		socket.once("open", () => resolve(Object.assign(socket, { closed })));
		socket.once("error", reject);
	});
}

/** Connects and sends a hello with the given token (`null` leaves it out). */
async function connectAs(port: number, token: string | null = TOKEN): Promise<TestSocket> {
	const socket = await connect(port);
	socket.send(JSON.stringify({ type: "hello", protocol: 1, token: token ?? undefined, world: "Test", user: "GM" }));
	return socket;
}

function nextMessage(socket: WebSocket): Promise<any> {
	return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("FoundryBridge", () => {
	let bridge: FoundryBridge;

	beforeEach(async () => {
		bridge = new FoundryBridge({ port: 0, token: TOKEN, timeoutMs: 200, authTimeoutMs: 100 });
		await bridge.start();
	});

	afterEach(async () => {
		await bridge.stop();
	});

	it("tracks hello and state from an authenticated Foundry", async () => {
		const events: unknown[] = [];
		bridge.on("connection", (connected) => events.push(connected));
		bridge.on("state", (s) => events.push(s));

		const socket = await connectAs(bridge.port);
		socket.send(JSON.stringify({ type: "state", state }));
		await flush();

		expect(bridge.connected).toBe(true);
		expect(bridge.hello).toEqual({ type: "hello", protocol: 1, world: "Test", user: "GM" });
		expect(bridge.state).toEqual(state);

		socket.close();
		await flush();

		expect(bridge.connected).toBe(false);
		expect(bridge.state).toBeNull();
		expect(events).toEqual([true, state, false, null]);
	});

	it("rejects connections with a wrong or missing token", async () => {
		let unauthorized = 0;
		bridge.on("unauthorized", () => unauthorized++);

		const wrong = await connectAs(bridge.port, "nope");
		expect(await wrong.closed).toBe(CLOSE_UNAUTHORIZED);

		const missing = await connectAs(bridge.port, null);
		expect(await missing.closed).toBe(CLOSE_UNAUTHORIZED);

		const notHello = await connect(bridge.port);
		notHello.send(JSON.stringify({ type: "state", state }));
		expect(await notHello.closed).toBe(CLOSE_UNAUTHORIZED);

		expect(unauthorized).toBe(3);
		expect(bridge.connected).toBe(false);
		expect(bridge.state).toBeNull();
	});

	it("drops connections that never say hello", async () => {
		const silent = await connect(bridge.port);
		expect(await silent.closed).toBe(CLOSE_UNAUTHORIZED);
	});

	it("does not let an unauthenticated connection disturb the active client", async () => {
		const good = await connectAs(bridge.port);
		await flush();

		const intruder = await connectAs(bridge.port, "nope");
		expect(await intruder.closed).toBe(CLOSE_UNAUTHORIZED);
		expect(bridge.connected).toBe(true);
		expect(good.readyState).toBe(WebSocket.OPEN);
		good.close();
	});

	it("resolves and rejects commands from Foundry's results", async () => {
		const socket = await connectAs(bridge.port);
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

		const socket = await connectAs(bridge.port);
		await flush();
		await expect(bridge.send("combat.nextTurn", {})).rejects.toThrow("did not answer");
		socket.close();
	});

	it("replaces the previous Foundry client with the newest authenticated one", async () => {
		const first = await connectAs(bridge.port);
		await flush();
		const closed = first.closed;

		const second = await connectAs(bridge.port);
		expect(await closed).toBe(CLOSE_REPLACED);

		const pending = bridge.send("game.togglePause", {});
		const message = await nextMessage(second);
		expect(message.command).toBe("game.togglePause");
		second.send(JSON.stringify({ type: "result", id: message.id, ok: true }));
		await expect(pending).resolves.toBeUndefined();

		second.close();
	});

	it("disconnects the client when the token changes", async () => {
		const socket = await connectAs(bridge.port);
		await flush();

		const closed = socket.closed;
		bridge.setToken("new-token");
		expect(await closed).toBe(CLOSE_UNAUTHORIZED);
		expect(bridge.connected).toBe(false);

		const again = await connectAs(bridge.port, "new-token");
		await flush();
		expect(bridge.connected).toBe(true);
		again.close();
	});

	it("moves to a new port and drops clients on the old one", async () => {
		const socket = await connectAs(bridge.port);
		await flush();
		const oldPort = bridge.port;
		const closed = socket.closed;

		// Grab a free port by briefly binding to port 0.
		const probe = new FoundryBridge({ port: 0, token: TOKEN });
		await probe.start();
		const newPort = probe.port;
		await probe.stop();

		await bridge.setPort(newPort);
		await closed;
		expect(bridge.port).toBe(newPort);
		expect(bridge.connected).toBe(false);
		await expect(connect(oldPort)).rejects.toThrow();

		const moved = await connectAs(newPort);
		await flush();
		expect(bridge.connected).toBe(true);
		moved.close();
	});

	it("fails to start when the port is taken", async () => {
		const other = new FoundryBridge({ port: bridge.port, token: TOKEN });
		await expect(other.start()).rejects.toThrow(/EADDRINUSE/);
		expect(other.listening).toBe(false);
	});
});
