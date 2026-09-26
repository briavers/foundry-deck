import streamDeck from "@elgato/streamdeck";

import { NextRoundAction, NextTurnAction, PreviousRoundAction, PreviousTurnAction, StartCombatAction } from "./actions/combat";
import { NextTrackAction, PlaylistToggleAction, PreviousTrackAction, StopAllMusicAction, VolumeAction } from "./actions/music";
import { PauseAction } from "./actions/pause";
import { FoundryBridge } from "./bridge/foundry-bridge";
import { DEFAULT_PORT } from "./bridge/protocol";

streamDeck.logger.setLevel("info");

const port = Number(process.env.FOUNDRY_DECK_PORT) || DEFAULT_PORT;
const foundry = new FoundryBridge({ port, logger: streamDeck.logger.createScope("Foundry") });

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

foundry.start().catch((err: Error) => {
	streamDeck.logger.error(`Could not listen on port ${port}: ${err.message}`);
});

streamDeck.connect();
