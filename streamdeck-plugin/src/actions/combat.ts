import { action, type KeyAction } from "@elgato/streamdeck";

import type { FoundryState } from "../bridge/protocol";
import { type Command, FoundryAction } from "./foundry-action";
import { fitTitle } from "./format";

type NoSettings = Record<string, never>;

/** Shows whose turn it is; pressing advances to the next combatant. */
@action({ UUID: "com.briavers.foundry-deck.combat-next-turn" })
export class NextTurnAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "combat.nextTurn", params: {} };
	}

	protected override async render(action: KeyAction<NoSettings>, _settings: NoSettings, state: FoundryState | null): Promise<void> {
		const name = state?.combat?.combatant?.name;
		await action.setTitle(name ? fitTitle(name) : "");
	}
}

@action({ UUID: "com.briavers.foundry-deck.combat-previous-turn" })
export class PreviousTurnAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "combat.previousTurn", params: {} };
	}
}

/** Shows the current round; pressing advances to the next round. */
@action({ UUID: "com.briavers.foundry-deck.combat-next-round" })
export class NextRoundAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "combat.nextRound", params: {} };
	}

	protected override async render(action: KeyAction<NoSettings>, _settings: NoSettings, state: FoundryState | null): Promise<void> {
		const combat = state?.combat;
		await action.setTitle(combat?.started ? `Rd ${combat.round}` : "");
	}
}

@action({ UUID: "com.briavers.foundry-deck.combat-previous-round" })
export class PreviousRoundAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "combat.previousRound", params: {} };
	}
}

@action({ UUID: "com.briavers.foundry-deck.combat-start" })
export class StartCombatAction extends FoundryAction<NoSettings> {
	protected override command(): Command {
		return { command: "combat.start", params: {} };
	}
}
