import streamDeck from "@elgato/streamdeck";

import { NextRoundAction, NextTurnAction, PreviousRoundAction, PreviousTurnAction, StartCombatAction } from "./actions/combat";
import { NextTrackAction, PlaylistToggleAction, PreviousTrackAction, StopAllMusicAction, VolumeAction } from "./actions/music";
import { PauseAction } from "./actions/pause";
import { FoundryBridge } from "./bridge/foundry-bridge";
import { DEFAULT_PORT } from "./bridge/protocol";
import { type GlobalSettings, parsePort, resolveSettings } from "./connection-settings";

streamDeck.logger.setLevel("info");
const logger = streamDeck.logger.createScope("Foundry");

// Real port and token are applied from global settings once Stream Deck is connected.
const foundry = new FoundryBridge({ port: DEFAULT_PORT, token: "", logger });

streamDeck.actions.registerAction(new NextTurnAction(foundry));
streamDeck.actions.registerAction(new PreviousTurnAction(foundry));
streamDeck.actions.registerAction(new NextRoundAction(foundry));
streamDeck.actions.registerAction(new PreviousRoundAction(foundry));
streamDeck.actions.registerAction(new StartCombatAction(foundry));
streamDeck.actions.registerAction(new PauseAction(foundry));
streamDeck.actions.registerAction(new PlaylistToggleAction(foundry));
streamDeck.actions.registerAction(new NextTrackAction(foundry));
streamDeck.actions.registerAction(new PreviousTrackAction(foundry));
streamDeck.actions.registerAction(new StopAllMusicAction(foundry));
streamDeck.actions.registerAction(new VolumeAction(foundry));

/** Applies stored connection settings, filling in defaults / a fresh token where needed. */
async function applySettings(stored: GlobalSettings): Promise<void> {
	const { port, token, toStore } = resolveSettings(stored, foundry.port);
	if (toStore) await streamDeck.settings.setGlobalSettings<GlobalSettings>({ ...stored, ...toStore });
	if (stored.port !== undefined && parsePort(stored.port) === null) {
		logger.warn(`Ignoring invalid port "${stored.port}"; still using ${port}`);
	}

	foundry.setToken(token);
	try {
		await foundry.setPort(port);
	} catch (err) {
		logger.error(`Could not listen on port ${port}: ${(err as Error).message}`);
	}
}

// Settings changes restart the server, so apply them one at a time.
let queue = Promise.resolve();
const enqueue = (stored: GlobalSettings) =>
	(queue = queue.then(() => applySettings(stored)).catch((err: Error) => {
		logger.error(`Applying settings failed: ${err.message}`);
	}));

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => void enqueue(ev.settings));

await streamDeck.connect();
await enqueue(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
