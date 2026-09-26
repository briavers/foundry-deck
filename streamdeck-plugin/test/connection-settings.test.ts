import { describe, expect, it } from "vitest";

import { generateToken, parsePort, resolveSettings } from "../src/connection-settings";

describe("parsePort", () => {
	it("accepts numbers and numeric strings in the unprivileged range", () => {
		expect(parsePort(17380)).toBe(17380);
		expect(parsePort(" 28000 ")).toBe(28000);
	});

	it("rejects junk, privileged and out-of-range ports", () => {
		for (const value of [undefined, "", "abc", "80", 1023, 65536, 1.5]) {
			expect(parsePort(value)).toBeNull();
		}
	});
});

describe("generateToken", () => {
	it("creates distinct URL-safe tokens", () => {
		const a = generateToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
		expect(generateToken()).not.toBe(a);
	});
});

describe("resolveSettings", () => {
	it("fills in the default port and a fresh token on first run", () => {
		const result = resolveSettings({});
		expect(result.port).toBe(17380);
		expect(result.token).toHaveLength(24);
		expect(result.toStore).toEqual({ port: "17380", token: result.token });
	});

	it("keeps valid stored settings untouched", () => {
		expect(resolveSettings({ port: "28000", token: "abc" })).toEqual({ port: 28000, token: "abc", toStore: null });
	});

	it("keeps the current port but doesn't overwrite a half-typed one", () => {
		expect(resolveSettings({ port: "28", token: "abc" }, 17380)).toEqual({ port: 17380, token: "abc", toStore: null });
		expect(resolveSettings({ port: "", token: "abc" }, 17380)).toEqual({ port: 17380, token: "abc", toStore: null });
	});

	it("regenerates and stores a blank token", () => {
		const result = resolveSettings({ port: "17380", token: "   " });
		expect(result.token).toHaveLength(24);
		expect(result.toStore).toEqual({ token: result.token });
	});
});
