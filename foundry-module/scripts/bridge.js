/** Close code the plugin uses when a newer Foundry client takes over the connection. */
export const CLOSE_REPLACED = 4000;

/** Close code the plugin uses when our token is missing or wrong. */
export const CLOSE_UNAUTHORIZED = 4001;

export const PROTOCOL_VERSION = 1;

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

/**
 * Reconnecting WebSocket client that talks to the Stream Deck plugin.
 * Doesn't touch any Foundry globals: everything it needs is passed in,
 * so it can be tested under plain Node.
 */
export class DeckBridge {
  #url;
  #token;
  #commands;
  #getState;
  #hello;
  #WebSocket;
  #onStatus;
  #logger;
  #debounceMs;

  #socket = null;
  #reconnectDelay = MIN_RECONNECT_MS;
  #reconnectTimer = null;
  #syncTimer = null;
  #stopped = true;

  /**
   * @param {object} options
   * @param {string} options.url                   ws:// address of the plugin
   * @param {string} options.token                 shared secret shown in the plugin's settings
   * @param {Record<string, Function>} options.commands  see commands.js
   * @param {() => object} options.getState       see state.js
   * @param {() => object} options.hello          extra fields for the hello message
   * @param {typeof WebSocket} [options.WebSocket]
   * @param {(status: "connected"|"disconnected"|"replaced"|"unauthorized") => void} [options.onStatus]
   * @param {Pick<Console, "debug"|"warn"|"error">} [options.logger]
   * @param {number} [options.debounceMs]
   */
  constructor({ url, token, commands, getState, hello, WebSocket = globalThis.WebSocket, onStatus = () => {}, logger = console, debounceMs = 100 }) {
    this.#url = url;
    this.#token = token;
    this.#commands = commands;
    this.#getState = getState;
    this.#hello = hello;
    this.#WebSocket = WebSocket;
    this.#onStatus = onStatus;
    this.#logger = logger;
    this.#debounceMs = debounceMs;
  }

  get connected() {
    return this.#socket?.readyState === this.#WebSocket.OPEN;
  }

  connect() {
    this.#stopped = false;
    this.#open();
  }

  disconnect() {
    this.#stopped = true;
    clearTimeout(this.#reconnectTimer);
    clearTimeout(this.#syncTimer);
    this.#socket?.close(1000, "disconnect");
    this.#socket = null;
  }

  /** Debounced: many hooks fire at once (e.g. a turn change updates combat + combatants). */
  syncState() {
    if (!this.connected) return;
    clearTimeout(this.#syncTimer);
    this.#syncTimer = setTimeout(() => this.#sendState(), this.#debounceMs);
  }

  #open() {
    let socket;
    try {
      socket = new this.#WebSocket(this.#url);
    } catch (err) {
      this.#logger.error("Foundry Deck | invalid Stream Deck URL", err);
      return;
    }
    this.#socket = socket;

    socket.addEventListener("open", () => {
      this.#reconnectDelay = MIN_RECONNECT_MS;
      this.#send({ type: "hello", protocol: PROTOCOL_VERSION, token: this.#token, ...this.#hello() });
      this.#sendState();
      this.#onStatus("connected");
    });

    socket.addEventListener("message", (event) => this.#onMessage(event.data));

    socket.addEventListener("close", (event) => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      clearTimeout(this.#syncTimer);

      if (event.code === CLOSE_REPLACED) {
        // Another tab owns the deck now; reconnecting would just steal it back.
        this.#stopped = true;
        this.#onStatus("replaced");
        return;
      }

      if (event.code === CLOSE_UNAUTHORIZED) {
        // Retrying with the same token can't succeed; wait for the settings to change.
        this.#stopped = true;
        this.#onStatus("unauthorized");
        return;
      }

      this.#onStatus("disconnected");
      this.#scheduleReconnect();
    });

    // Errors are always followed by "close", which handles reconnecting.
    socket.addEventListener("error", () => {});
  }

  #scheduleReconnect() {
    if (this.#stopped) return;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => this.#open(), this.#reconnectDelay);
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, MAX_RECONNECT_MS);
  }

  async #onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.#logger.warn("Foundry Deck | ignoring non-JSON message", raw);
      return;
    }

    switch (message?.type) {
      case "requestState":
        this.#sendState();
        break;
      case "command":
        await this.#runCommand(message);
        break;
      default:
        this.#logger.debug("Foundry Deck | ignoring message", message);
    }
  }

  async #runCommand({ id, command, params }) {
    const handler = Object.hasOwn(this.#commands, command) ? this.#commands[command] : null;
    if (!handler) {
      this.#send({ type: "result", id, ok: false, error: `Unknown command: ${command}` });
      return;
    }

    try {
      await handler(params ?? {});
      this.#send({ type: "result", id, ok: true });
    } catch (err) {
      this.#send({ type: "result", id, ok: false, error: err?.message ?? String(err) });
    }
  }

  #sendState() {
    this.#send({ type: "state", state: this.#getState() });
  }

  #send(message) {
    if (this.connected) this.#socket.send(JSON.stringify(message));
  }
}
