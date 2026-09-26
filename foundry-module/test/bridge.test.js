import { test } from "node:test";
import assert from "node:assert/strict";

import { CLOSE_REPLACED, CLOSE_UNAUTHORIZED, DeckBridge } from "../scripts/bridge.js";

/** In-memory WebSocket double; each instance is recorded in `FakeSocket.instances`. */
class FakeSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  readyState = FakeSocket.CONNECTING;
  sent = [];

  constructor(url) {
    super();
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data) { this.sent.push(JSON.parse(data)); }

  close(code = 1000) {
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event("close"), { code }));
  }

  // Test helpers
  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(message) {
    this.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify(message) }));
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const silent = { debug() {}, warn() {}, error() {} };

function makeBridge(overrides = {}) {
  FakeSocket.instances = [];
  const statuses = [];
  const bridge = new DeckBridge({
    url: "ws://127.0.0.1:17380",
    token: "s3cret",
    commands: {},
    getState: () => ({ paused: false }),
    hello: () => ({ world: "Test" }),
    WebSocket: FakeSocket,
    onStatus: (s) => statuses.push(s),
    logger: silent,
    debounceMs: 5,
    ...overrides,
  });
  return { bridge, statuses };
}

test("sends hello with the token, then state, on open", () => {
  const { bridge, statuses } = makeBridge();
  bridge.connect();
  const socket = FakeSocket.instances[0];
  socket.open();

  assert.deepEqual(socket.sent, [
    { type: "hello", protocol: 1, token: "s3cret", world: "Test" },
    { type: "state", state: { paused: false } },
  ]);
  assert.deepEqual(statuses, ["connected"]);
  bridge.disconnect();
});

test("runs commands and replies with results", async () => {
  const calls = [];
  const { bridge } = makeBridge({
    commands: {
      ok: async (params) => { calls.push(params); },
      boom: async () => { throw new Error("nope"); },
    },
  });
  bridge.connect();
  const socket = FakeSocket.instances[0];
  socket.open();
  socket.sent = [];

  socket.receive({ type: "command", id: "1", command: "ok", params: { x: 1 } });
  socket.receive({ type: "command", id: "2", command: "boom" });
  socket.receive({ type: "command", id: "3", command: "toString" });
  await tick();

  assert.deepEqual(calls, [{ x: 1 }]);
  // Replies may arrive in any order; commands run concurrently.
  assert.deepEqual(socket.sent.toSorted((a, b) => a.id.localeCompare(b.id)), [
    { type: "result", id: "1", ok: true },
    { type: "result", id: "2", ok: false, error: "nope" },
    { type: "result", id: "3", ok: false, error: "Unknown command: toString" },
  ]);
  bridge.disconnect();
});

test("requestState replies immediately; syncState is debounced", async () => {
  const { bridge } = makeBridge();
  bridge.connect();
  const socket = FakeSocket.instances[0];
  socket.open();
  socket.sent = [];

  socket.receive({ type: "requestState" });
  await tick();
  assert.equal(socket.sent.length, 1);

  bridge.syncState();
  bridge.syncState();
  bridge.syncState();
  await tick(20);
  assert.equal(socket.sent.length, 2);
  bridge.disconnect();
});

test("reconnects after an unexpected close", async () => {
  const { bridge, statuses } = makeBridge();
  bridge.connect();
  FakeSocket.instances[0].open();
  FakeSocket.instances[0].close(1006);

  assert.deepEqual(statuses, ["connected", "disconnected"]);
  await tick(1_100);
  assert.equal(FakeSocket.instances.length, 2);
  bridge.disconnect();
});

test("stays disconnected when another client replaced it", async () => {
  const { bridge, statuses } = makeBridge();
  bridge.connect();
  FakeSocket.instances[0].open();
  FakeSocket.instances[0].close(CLOSE_REPLACED);

  assert.deepEqual(statuses, ["connected", "replaced"]);
  await tick(1_100);
  assert.equal(FakeSocket.instances.length, 1);
});

test("stops retrying when the plugin rejects the token", async () => {
  const { bridge, statuses } = makeBridge();
  bridge.connect();
  FakeSocket.instances[0].open();
  FakeSocket.instances[0].close(CLOSE_UNAUTHORIZED);

  assert.deepEqual(statuses, ["connected", "unauthorized"]);
  await tick(1_100);
  assert.equal(FakeSocket.instances.length, 1);
});
