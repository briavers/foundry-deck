import streamDeck, { action, type KeyAction, type SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";

import type { FoundryBridge } from "../bridge/foundry-bridge";
import type { FoundryState } from "../bridge/protocol";
import { type Command, FoundryAction } from "./foundry-action";
import { fitTitle, formatPercent } from "./format";

type PlaylistSettings = { playlistId?: string };

type NoSettings = Record<string, never>;

type VolumeSettings = { direction?: "up" | "down"; step?: number };

const STOPPED = 0;
const PLAYING = 1;

/** sdpi-components `datasource` event names used by ui/playlist.html and ui/playlist-skip.html. */
const PLAYLISTS_EVENT = "getPlaylists";
const PLAYLISTS_OR_ANY_EVENT = "getPlaylistsOrAny";

/**
 * Answers the property inspector's request for the playlist dropdown items.
 * See https://sdpi-components.dev/docs/helpers/data-source
 */
async function answerPlaylistRequest(ev: SendToPluginEvent<JsonValue, JsonObject>, foundry: FoundryBridge): Promise<void> {
	const payload = ev.payload as { event?: string } | null;
	const event = payload?.event;
	if (event !== PLAYLISTS_EVENT && event !== PLAYLISTS_OR_ANY_EVENT) return;

	const state = foundry.state;
	const items: { label: string; value: string; disabled?: boolean }[] = [];

	if (event === PLAYLISTS_OR_ANY_EVENT) items.push({ label: "Whatever is playing", value: "" });
	if (!state) items.push({ label: "Foundry not connected", value: "__offline", disabled: true });

	for (const playlist of state?.playlists ?? []) {
		items.push({ label: playlist.name, value: playlist.id });
	}

	await streamDeck.ui.sendToPropertyInspector({ event, items });
}

/** Plays or stops one playlist; the key shows its name and playing state. */
@action({ UUID: "com.briavers.foundry-deck.playlist-toggle" })
export class PlaylistToggleAction extends FoundryAction<PlaylistSettings> {
	protected override command({ playlistId }: PlaylistSettings): Command | null {
		return playlistId ? { command: "playlist.toggle", params: { playlistId } } : null;
	}

	protected override async render(action: KeyAction<PlaylistSettings>, { playlistId }: PlaylistSettings, state: FoundryState | null): Promise<void> {
		const playlist = state?.playlists.find((p) => p.id === playlistId);
		await action.setState(playlist?.playing ? PLAYING : STOPPED);

		if (!playlistId) await action.setTitle("Pick a\nplaylist");
		else if (playlist) await action.setTitle(fitTitle(playlist.name));
		else if (state) await action.setTitle("Missing\nplaylist");
		// Offline: keep the last known name on the key.
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PlaylistSettings>): Promise<void> {
		await answerPlaylistRequest(ev, this.foundry);
	}
}

@action({ UUID: "com.briavers.foundry-deck.playlist-next" })
export class NextTrackAction extends FoundryAction<PlaylistSettings> {
	protected override command({ playlistId }: PlaylistSettings): Command {
		return { command: "playlist.next", params: playlistId ? { playlistId } : {} };
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PlaylistSettings>): Promise<void> {
		await answerPlaylistRequest(ev, this.foundry);
	}
}

@action({ UUID: "com.briavers.foundry-deck.playlist-previous" })
export class PreviousTrackAction extends FoundryAction<PlaylistSettings> {
	protected override command({ playlistId }: PlaylistSettings): Command {
		return { command: "playlist.previous", params: playlistId ? { playlistId } : {} };
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PlaylistSettings>): Promise<void> {
		await answerPlaylistRequest(ev, this.foundry);
	}
}

@action({ UUID: "com.briavers.foundry-deck.playlist-stop-all" })
export class StopAllMusicAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "playlist.stopAll", params: {} };
	}
}

/** Raises or lowers Foundry's global playlist volume; the key shows the current level. */
@action({ UUID: "com.briavers.foundry-deck.volume" })
export class VolumeAction extends FoundryAction<VolumeSettings> {
	protected override command({ direction = "up", step = 5 }: VolumeSettings): Command {
		const delta = (direction === "down" ? -step : step) / 100;
		return { command: "volume.adjust", params: { delta } };
	}

	protected override async render(action: KeyAction<VolumeSettings>, { direction = "up" }: VolumeSettings, state: FoundryState | null): Promise<void> {
		const label = direction === "down" ? "Vol -" : "Vol +";
		await action.setTitle(state ? `${label}\n${formatPercent(state.volume)}` : label);
	}
}
