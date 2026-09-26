import streamDeck, {
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import type { FoundryBridge } from "../bridge/foundry-bridge";
import type { CommandName, CommandParams, FoundryState } from "../bridge/protocol";

export type Command = { [C in CommandName]: { command: C; params: CommandParams[C] } }[CommandName];

/**
 * Base for every key that sends a command to Foundry and (optionally) reflects Foundry state.
 * Subclasses describe *what* to send in {@link command} and *how the key looks* in {@link render}.
 */
export abstract class FoundryAction<T extends JsonObject = JsonObject> extends SingletonAction<T> {
	constructor(protected readonly foundry: FoundryBridge) {
		super();
		foundry.on("state", (state) => void this.#renderAll(state));
	}

	/** The command to send on key press, or `null` when the key isn't configured yet. */
	protected abstract command(settings: T): Command | null;

	/** Update title/state/image from Foundry state. `state` is `null` while Foundry is disconnected. */
	protected render(_action: KeyAction<T>, _settings: T, _state: FoundryState | null): Promise<void> | void {}

	override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings, this.foundry.state);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
		if (ev.action.isKey()) await this.render(ev.action, ev.payload.settings, this.foundry.state);
	}

	override async onKeyDown(ev: KeyDownEvent<T>): Promise<void> {
		const command = this.command(ev.payload.settings);
		if (!command) {
			await ev.action.showAlert();
			return;
		}

		try {
			await this.foundry.send(command.command, command.params);
		} catch (err) {
			streamDeck.logger.warn(`${command.command} failed: ${(err as Error).message}`);
			await ev.action.showAlert();
		}
	}

	async #renderAll(state: FoundryState | null): Promise<void> {
		for (const action of this.actions) {
			if (!action.isKey()) continue;
			try {
				await this.render(action, await action.getSettings(), state);
			} catch (err) {
				streamDeck.logger.error(`Rendering ${this.manifestId} failed`, err);
			}
		}
	}
}
