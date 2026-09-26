import { DeckBridge } from "./bridge.js";
import { createCommands } from "./commands.js";
import { collectState } from "./state.js";

const MODULE_ID = "foundry-deck";
const DEFAULT_URL = "ws://127.0.0.1:17380";

/** Hooks that can change anything in the state snapshot. */
const STATE_HOOKS = [
  "pauseGame",
  "createCombat",
  "updateCombat",
  "deleteCombat",
  "combatStart",
  "createCombatant",
  "updateCombatant",
  "deleteCombatant",
  "createPlaylist",
  "updatePlaylist",
  "deletePlaylist",
  "createPlaylistSound",
  "updatePlaylistSound",
  "deletePlaylistSound",
  "globalPlaylistVolumeChanged",
];

/** @type {DeckBridge | null} */
let bridge = null;

function startBridge() {
  bridge?.disconnect();
  bridge = null;

  if (!game.user.isGM || !game.settings.get(MODULE_ID, "enabled")) return;

  bridge = new DeckBridge({
    url: game.settings.get(MODULE_ID, "url"),
    commands: createCommands(game),
    getState: () => collectState(game),
    hello: () => ({
      module: game.modules.get(MODULE_ID)?.version ?? "0.0.0",
      foundry: game.version,
      world: game.world.title,
      user: game.user.name,
    }),
    onStatus: (status) => {
      if (status === "connected") ui.notifications.info(game.i18n.localize("FOUNDRY_DECK.Notifications.Connected"));
      if (status === "replaced") ui.notifications.warn(game.i18n.localize("FOUNDRY_DECK.Notifications.Replaced"));
    },
  });
  bridge.connect();
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "FOUNDRY_DECK.Settings.Enabled.Name",
    hint: "FOUNDRY_DECK.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: startBridge,
  });

  game.settings.register(MODULE_ID, "url", {
    name: "FOUNDRY_DECK.Settings.Url.Name",
    hint: "FOUNDRY_DECK.Settings.Url.Hint",
    scope: "client",
    config: true,
    type: String,
    default: DEFAULT_URL,
    onChange: startBridge,
  });
});

Hooks.once("ready", () => {
  for (const hook of STATE_HOOKS) Hooks.on(hook, () => bridge?.syncState());
  startBridge();

  // Handy for debugging from the browser console.
  game.modules.get(MODULE_ID).api = { get bridge() { return bridge; }, reconnect: startBridge };
});
