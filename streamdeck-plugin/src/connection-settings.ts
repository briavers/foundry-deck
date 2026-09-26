import { randomBytes } from "node:crypto";

import { DEFAULT_PORT } from "./bridge/protocol";

/**
 * Plugin-wide settings, stored in Stream Deck's global settings and edited in the
 * "Connection" section of every key's property inspector (ui/*.html).
 * sdpi text fields save strings, so values are parsed defensively.
 */
export type GlobalSettings = {
	port?: string | number;
	token?: string;
};

export type ConnectionSettings = {
	port: number;
	token: string;
};

/** Ports below 1024 need admin rights on macOS/Linux, so they're not allowed. */
export function parsePort(value: unknown): number | null {
	const port = typeof value === "number" ? value : Number(String(value ?? "").trim());
	return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

/** 24 URL-safe characters, easy to copy-paste into Foundry's module settings. */
export function generateToken(): string {
	return randomBytes(18).toString("base64url");
}

/**
 * Turns whatever is stored into usable settings. A missing or invalid port falls back to
 * `fallbackPort` (the port currently in use), and a blank token gets a fresh one.
 *
 * `toStore` holds only values that should be written back: a port on first run and a newly
 * generated token. A port the user entered is never overwritten. The field may save while
 * it's being typed (`28` on the way to `28000`), and writing back would fight the user.
 */
export function resolveSettings(stored: GlobalSettings, fallbackPort = DEFAULT_PORT): ConnectionSettings & { toStore: GlobalSettings | null } {
	const port = parsePort(stored.port) ?? fallbackPort;
	const storedToken = typeof stored.token === "string" ? stored.token.trim() : "";
	const token = storedToken || generateToken();

	const toStore: GlobalSettings = {};
	if (stored.port === undefined) toStore.port = String(port);
	if (token !== stored.token) toStore.token = token;

	return { port, token, toStore: Object.keys(toStore).length ? toStore : null };
}
