import { timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { type AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

import {
	CLOSE_REPLACED,
	CLOSE_UNAUTHORIZED,
	type CommandName,
	type CommandParams,
	type FoundryMessage,
	type FoundryState,
	type HelloMessage,
	type PluginMessage,
	PROTOCOL_VERSION,
} from "./protocol";

export type BridgeLogger = {
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	debug(...args: unknown[]): void;
};

export type FoundryBridgeOptions = {
	port: number;
	/** Shared secret Foundry must present in its `hello`. */
	token: string;
	host?: string;
	/** How long to wait for Foundry to acknowledge a command. */
	timeoutMs?: number;
	/** How long a new connection may take to send a valid `hello`. */
	authTimeoutMs?: number;
	logger?: BridgeLogger;
};

type BridgeEvents = {
	/** Latest snapshot from Foundry, or `null` once Foundry disconnects. */
	state: [FoundryState | null];
	connection: [connected: boolean, hello: HelloMessage | null];
	/** A connection presented a missing or wrong token. */
	unauthorized: [];
};

type Pending = {
	resolve: () => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
};

/** Messages are small JSON snapshots; anything bigger is not from our module. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

const noopLogger: BridgeLogger = { info() {}, warn() {}, debug() {} };

function tokensMatch(expected: string, actual: unknown): boolean {
	if (typeof actual !== "string" || !expected) return false;
	const a = Buffer.from(expected);
	const b = Buffer.from(actual);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Local WebSocket server the Foundry module connects to.
 *
 * A new connection has to authenticate with the shared token in its `hello` first. Until then
 * it can't send commands, receive anything, or disturb the active client. Once it's
 * authenticated it replaces the previous client, e.g. when the GM reloads or opens a second tab.
 */
export class FoundryBridge extends EventEmitter<BridgeEvents> {
	readonly #host: string;
	readonly #timeoutMs: number;
	readonly #authTimeoutMs: number;
	readonly #logger: BridgeLogger;

	#port: number;
	#token: string;
	#server: WebSocketServer | null = null;
	#client: WebSocket | null = null;
	#hello: HelloMessage | null = null;
	#state: FoundryState | null = null;
	#nextId = 1;
	readonly #pending = new Map<string, Pending>();

	constructor({ port, token, host = "127.0.0.1", timeoutMs = 5_000, authTimeoutMs = 5_000, logger = noopLogger }: FoundryBridgeOptions) {
		super();
		this.#host = host;
		this.#port = port;
		this.#token = token;
		this.#timeoutMs = timeoutMs;
		this.#authTimeoutMs = authTimeoutMs;
		this.#logger = logger;
	}

	get connected(): boolean {
		return this.#client?.readyState === WebSocket.OPEN;
	}

	get state(): FoundryState | null {
		return this.#state;
	}

	get hello(): HelloMessage | null {
		return this.#hello;
	}

	/** Port actually bound; differs from the requested one when `port: 0` is used in tests. */
	get port(): number {
		return (this.#server?.address() as AddressInfo | null)?.port ?? this.#port;
	}

	get listening(): boolean {
		return this.#server !== null;
	}

	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = new WebSocketServer({ host: this.#host, port: this.#port, maxPayload: MAX_PAYLOAD_BYTES });
			server.once("listening", () => {
				this.#server = server;
				this.#logger.info(`Listening for Foundry on ws://${this.#host}:${this.port}`);
				resolve();
			});
			server.once("error", (err) => {
				server.close();
				reject(err);
			});
			server.on("connection", (socket) => this.#accept(socket));
		});
	}

	async stop(): Promise<void> {
		const server = this.#server;
		this.#server = null;
		if (!server) return;

		for (const socket of server.clients) socket.close(1001, "plugin stopping");
		if (this.#client) this.#detach();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}

	/** Moves the server to another port. Foundry reconnects once its port setting matches. */
	async setPort(port: number): Promise<void> {
		if (port === this.#port && this.listening) return;
		await this.stop();
		this.#port = port;
		await this.start();
	}

	/** Changes the shared token. The active client used the old token, so it gets disconnected. */
	setToken(token: string): void {
		if (token === this.#token) return;
		this.#token = token;
		if (this.#client) {
			this.#logger.info("Token changed; disconnecting Foundry");
			this.#client.close(CLOSE_UNAUTHORIZED, "token changed");
			this.#detach();
		}
	}

	/**
	 * Sends a command to Foundry and resolves once Foundry reports it ran.
	 * Rejects when Foundry isn't connected, reports an error, or doesn't answer in time.
	 */
	send<C extends CommandName>(command: C, params: CommandParams[C]): Promise<void> {
		const client = this.#client;
		if (!client || client.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("Foundry is not connected"));
		}

		const id = String(this.#nextId++);
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				reject(new Error(`Foundry did not answer "${command}" in time`));
			}, this.#timeoutMs);

			this.#pending.set(id, { resolve, reject, timer });
			this.#write(client, { type: "command", id, command, params });
		});
	}

	requestState(): void {
		if (this.#client) this.#write(this.#client, { type: "requestState" });
	}

	#accept(socket: WebSocket): void {
		const authTimer = setTimeout(() => this.#reject(socket, "no hello received"), this.#authTimeoutMs);

		socket.on("message", (data) => {
			if (socket === this.#client) {
				this.#onMessage(data.toString());
				return;
			}
			clearTimeout(authTimer);
			this.#authenticate(socket, data.toString());
		});
		socket.on("close", () => {
			clearTimeout(authTimer);
			if (this.#client === socket) this.#detach();
		});
		socket.on("error", (err) => this.#logger.warn("Foundry socket error", err));
	}

	/** The first message must be a `hello` carrying the right token. */
	#authenticate(socket: WebSocket, raw: string): void {
		let hello: Partial<HelloMessage> | null = null;
		try {
			hello = JSON.parse(raw);
		} catch {
			// handled below
		}

		if (hello?.type !== "hello" || !tokensMatch(this.#token, hello.token)) {
			this.#reject(socket, "missing or wrong token");
			this.emit("unauthorized");
			return;
		}

		if (this.#client) {
			this.#logger.info("New Foundry client connected; replacing the previous one");
			this.#client.close(CLOSE_REPLACED, "replaced by another Foundry client");
			this.#detach();
		}

		this.#client = socket;
		this.#onHello(hello as HelloMessage);
	}

	#reject(socket: WebSocket, reason: string): void {
		if (socket === this.#client || socket.readyState !== WebSocket.OPEN) return;
		this.#logger.warn(`Rejected a Foundry connection: ${reason}`);
		socket.close(CLOSE_UNAUTHORIZED, "unauthorized");
	}

	/** Forget the current client and fail anything still waiting on it. */
	#detach(): void {
		this.#client = null;
		this.#hello = null;
		this.#state = null;

		for (const [id, pending] of this.#pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Foundry disconnected"));
			this.#pending.delete(id);
		}

		this.#logger.info("Foundry disconnected");
		this.emit("connection", false, null);
		this.emit("state", null);
	}

	#onHello(message: HelloMessage): void {
		if (message.protocol !== PROTOCOL_VERSION) {
			this.#logger.warn(`Foundry module speaks protocol v${message.protocol}, plugin expects v${PROTOCOL_VERSION}`);
		}
		const { token: _token, ...hello } = message;
		this.#hello = hello;
		this.#logger.info(`Foundry connected: world "${message.world}" as ${message.user}`);
		this.emit("connection", true, hello);
	}

	#onMessage(raw: string): void {
		let message: FoundryMessage;
		try {
			message = JSON.parse(raw) as FoundryMessage;
		} catch {
			this.#logger.warn("Ignoring non-JSON message from Foundry");
			return;
		}

		switch (message.type) {
			case "state":
				this.#state = message.state;
				this.emit("state", message.state);
				break;

			case "result": {
				const pending = this.#pending.get(message.id);
				if (!pending) return;
				clearTimeout(pending.timer);
				this.#pending.delete(message.id);
				if (message.ok) pending.resolve();
				else pending.reject(new Error(message.error));
				break;
			}

			default:
				this.#logger.debug("Ignoring unexpected message from Foundry", message);
		}
	}

	#write(socket: WebSocket, message: PluginMessage): void {
		socket.send(JSON.stringify(message));
	}
}
