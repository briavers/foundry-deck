/**
 * Wire protocol shared with the Foundry module. Keep in sync with docs/PROTOCOL.md.
 */

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 17380;

/** Close code sent to a Foundry client when a newer client takes over. */
export const CLOSE_REPLACED = 4000;

export type CombatantState = {
	id: string;
	name: string;
	img: string | null;
};

export type CombatState = {
	id: string;
	started: boolean;
	round: number;
	turn: number | null;
	combatant: CombatantState | null;
	count: number;
};

export type PlaylistState = {
	id: string;
	name: string;
	playing: boolean;
	mode: number;
	tracks: string[];
};

export type FoundryState = {
	paused: boolean;
	volume: number;
	combat: CombatState | null;
	playlists: PlaylistState[];
};

export type CommandParams = {
	"combat.nextTurn": Record<string, never>;
	"combat.previousTurn": Record<string, never>;
	"combat.nextRound": Record<string, never>;
	"combat.previousRound": Record<string, never>;
	"combat.start": Record<string, never>;
	"game.togglePause": { paused?: boolean };
	"playlist.toggle": { playlistId: string };
	"playlist.play": { playlistId: string };
	"playlist.stop": { playlistId: string };
	"playlist.next": { playlistId?: string };
	"playlist.previous": { playlistId?: string };
	"playlist.stopAll": Record<string, never>;
	"volume.adjust": { delta: number };
};

export type CommandName = keyof CommandParams;

export type HelloMessage = {
	type: "hello";
	protocol: number;
	module?: string;
	foundry?: string;
	world?: string;
	user?: string;
};

export type StateMessage = { type: "state"; state: FoundryState };

export type ResultMessage = { type: "result"; id: string; ok: true } | { type: "result"; id: string; ok: false; error: string };

export type FoundryMessage = HelloMessage | StateMessage | ResultMessage;

export type CommandMessage = {
	type: "command";
	id: string;
	command: CommandName;
	params: CommandParams[CommandName];
};

export type PluginMessage = CommandMessage | { type: "requestState" };
