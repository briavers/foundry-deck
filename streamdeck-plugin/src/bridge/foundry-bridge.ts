import { EventEmitter } from "node:events";
import { type AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

import {
	CLOSE_REPLACED,
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
	host?: string;
	/** How long to wait for Foundry to acknowledge a command. */
	timeoutMs?: number;
	logger?: BridgeLogger;
};

type BridgeEvents = {
	/** Latest snapshot from Foundry, or `null` once Foundry disconnects. */
	state: [FoundryState | null];
	connection: [connected: boolean, hello: HelloMessage | null];
};

type Pending = {
	resolve: () => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
};

const noopLogger: BridgeLogger = { info() {}, warn() {}, debug() {} };

/**
 * Local WebSocket server the Foundry module connects to. Only one Foundry client is active
 * at a time: a new connection replaces the previous one (e.g. the GM reloaded or opened a
 * second tab).
 */
export class FoundryBridge extends EventEmitter<BridgeEvents> {
	readonly #host: string;
	readonly #port: number;
	readonly #timeoutMs: number;
	readonly #logger: BridgeLogger;

	#server: WebSocketServer | null = null;
	#client: WebSocket | null = null;
	#hello: HelloMessage | null = null;
	#state: FoundryState | null = null;
	#nextId = 1;
	readonly #pending = new Map<string, Pending>();

	constructor({ port, host = "127.0.0.1", timeoutMs = 5_000, logger = noopLogger }: FoundryBridgeOptions) {
		super();
		this.#host = host;
		this.#port = port;
		this.#timeoutMs = timeoutMs;
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

	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = new WebSocketServer({ host: this.#host, port: this.#port });
			server.once("listening", () => {
				this.#logger.info(`Listening for Foundry on ws://${this.#host}:${this.port}`);
				resolve();
			});
			server.once("error", reject);
			server.on("connection", (socket) => this.#accept(socket));
			this.#server = server;
		});
	}

	async stop(): Promise<void> {
		this.#client?.close(1001, "plugin stopping");
		await new Promise<void>((resolve) => (this.#server ? this.#server.close(() => resolve()) : resolve()));
		this.#server = null;
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
		if (this.#client) {
			this.#logger.info("New Foundry client connected; replacing the previous one");
			this.#client.close(CLOSE_REPLACED, "replaced by another Foundry client");
			this.#detach();
		}

		this.#client = socket;
		socket.on("message", (data) => this.#onMessage(socket, data.toString()));
		socket.on("close", () => {
			if (this.#client === socket) this.#detach();
		});
		socket.on("error", (err) => this.#logger.warn("Foundry socket error", err));
	}

	/** Forget the current client and fail anything still waiting on it. */
	#detach(): void {
		const wasKnown = this.#hello !== null;
		this.#client = null;
		this.#hello = null;
		this.#state = null;

		for (const [id, pending] of this.#pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Foundry disconnected"));
			this.#pending.delete(id);
		}

		if (wasKnown) {
			this.#logger.info("Foundry disconnected");
			this.emit("connection", false, null);
		}
		this.emit("state", null);
	}

	#onMessage(socket: WebSocket, raw: string): void {
		if (socket !== this.#client) return;

		let message: FoundryMessage;
		try {
			message = JSON.parse(raw) as FoundryMessage;
		} catch {
			this.#logger.warn("Ignoring non-JSON message from Foundry");
			return;
		}

		switch (message.type) {
			case "hello":
				if (message.protocol !== PROTOCOL_VERSION) {
					this.#logger.warn(`Foundry module speaks protocol v${message.protocol}, plugin expects v${PROTOCOL_VERSION}`);
				}
				this.#hello = message;
				this.#logger.info(`Foundry connected: world "${message.world}" as ${message.user}`);
				this.emit("connection", true, message);
				break;

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
				this.#logger.debug("Ignoring unknown message from Foundry", message);
		}
	}

	#write(socket: WebSocket, message: PluginMessage): void {
		socket.send(JSON.stringify(message));
	}
}
