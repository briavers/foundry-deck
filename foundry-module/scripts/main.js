import { DeckBridge } from "./bridge.js";
import { createCommands } from "./commands.js";
import { collectState } from "./state.js";

const MODULE_ID = "foundry-deck";
const DEFAULT_PORT = 17380;

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

const localize = (key) => game.i18n.localize(`FOUNDRY_DECK.${key}`);

/** Same rules as the plugin: whole numbers from 1024 to 65535. */
function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT;
}

function startBridge() {
  bridge?.disconnect();
  bridge = null;

  if (!game.user.isGM || !game.settings.get(MODULE_ID, "enabled")) return;

  const token = game.settings.get(MODULE_ID, "token").trim();
  if (!token) {
    ui.notifications.warn(localize("Notifications.MissingToken"));
    return;
  }

  bridge = new DeckBridge({
    url: `ws://127.0.0.1:${validPort(game.settings.get(MODULE_ID, "port"))}`,
    token,
    commands: createCommands(game),
    getState: () => collectState(game),
    hello: () => ({
      module: game.modules.get(MODULE_ID)?.version ?? "0.0.0",
      foundry: game.version,
      world: game.world.title,
      user: game.user.name,
    }),
    onStatus: (status) => {
      if (status === "connected") ui.notifications.info(localize("Notifications.Connected"));
      if (status === "replaced") ui.notifications.warn(localize("Notifications.Replaced"));
      if (status === "unauthorized") ui.notifications.error(localize("Notifications.Unauthorized"), { permanent: true });
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

  game.settings.register(MODULE_ID, "port", {
    name: "FOUNDRY_DECK.Settings.Port.Name",
    hint: "FOUNDRY_DECK.Settings.Port.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: DEFAULT_PORT,
    onChange: startBridge,
  });

  game.settings.register(MODULE_ID, "token", {
    name: "FOUNDRY_DECK.Settings.Token.Name",
    hint: "FOUNDRY_DECK.Settings.Token.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "",
    onChange: startBridge,
  });
});

Hooks.once("ready", () => {
  for (const hook of STATE_HOOKS) Hooks.on(hook, () => bridge?.syncState());
  startBridge();

  // Handy for debugging from the browser console.
  game.modules.get(MODULE_ID).api = { get bridge() { return bridge; }, reconnect: startBridge };
});
