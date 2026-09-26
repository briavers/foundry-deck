import { action, type KeyAction } from "@elgato/streamdeck";

import type { FoundryState } from "../bridge/protocol";
import { type Command, FoundryAction } from "./foundry-action";

type NoSettings = Record<string, never>;

const RUNNING = 0;
const PAUSED = 1;

/** Toggles the game pause. State 0 = running, state 1 = paused (see manifest). */
@action({ UUID: "com.briavers.foundry-deck.pause" })
export class PauseAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "game.togglePause", params: {} };
	}

	protected override async render(action: KeyAction<NoSettings>, _settings: NoSettings, state: FoundryState | null): Promise<void> {
		await action.setState(state?.paused ? PAUSED : RUNNING);
	}
}
