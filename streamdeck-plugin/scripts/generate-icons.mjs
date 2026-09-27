/**
 * Generates the SVG action-list icons in the .sdPlugin folder.
 * Run with `npm run icons` after editing the glyphs below.
 *
 * - Action list icons: white glyph on transparent (Stream Deck guideline).
 * - Key images (the art on the physical keys) are no longer generated here: they're
 *   hand-picked fantasy-style PNGs in `imgs/actions/<name>/key(-1)(@2x).png`. See
 *   assets/icons/ at the repo root for the source renders.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../com.briavers.foundry-deck.sdPlugin/imgs");

/** 24×24 glyphs. `fill` glyphs use the path as a shape, `stroke` glyphs as lines. */
const glyphs = {
	nextTurn: { fill: "M6 5l9 7-9 7z M16 5h2.5v14H16z" },
	previousTurn: { fill: "M18 5l-9 7 9 7z M5.5 5H8v14H5.5z" },
	nextRound: { fill: "M3 5l9 7-9 7z M12 5l9 7-9 7z" },
	previousRound: { fill: "M21 5l-9 7 9 7z M12 5l-9 7 9 7z" },
	startCombat: { stroke: "M5 4l13 13 M19 4L6 17 M3.5 16.5l4 4 M16.5 20.5l4-4" },
	play: { fill: "M7 4l13 8-13 8z" },
	pause: { fill: "M6 4h4.5v16H6z M13.5 4H18v16h-4.5z" },
	music: { fill: "M9 17.5a3 3 0 1 1-2-2.83V5.5l12-2.5v11.5a3 3 0 1 1-2-2.83V7.4l-8 1.67z" },
	stop: { fill: "M6 6h12v12H6z" },
	volume: { fill: "M3 9h4l5-4.5v15L7 15H3z", stroke: "M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13" },
	d20: { stroke: "M12 2l8.66 5v10L12 22l-8.66-5V7z M12 2L7 15h10z M3.34 7L7 15 M20.66 7L17 15 M7 15l5 7 5-7" },
	loop: { stroke: "M6 7h9a5 5 0 0 1 5 5v1 M18 17H9a5 5 0 0 1-5-5v-1", fill: "M6 3l4 4-4 4z M18 21l-4-4 4-4z" },
};

const colors = {
	combat: "#8b1e1e",
	game: "#1e3a8b",
	music: "#5b2a86",
	active: "#1f7a3a",
	paused: "#b45309",
};

function glyphElements({ fill, stroke }, color) {
	let out = "";
	if (fill) out += `<path d="${fill}" fill="${color}"/>`;
	if (stroke) out += `<path d="${stroke}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
	return out;
}

function listIcon(glyph) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">${glyphElements(glyph, "#FFFFFF")}</svg>\n`;
}

/** 144×144 key tile; `titled` moves the glyph up to leave room for a bottom title. */
function keyImage(glyph, background, { titled = false } = {}) {
	const size = titled ? 60 : 84;
	const x = (144 - size) / 2;
	const y = titled ? 18 : x;
	const scale = size / 24;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" rx="16" fill="${background}"/>` +
		`<g transform="translate(${x} ${y}) scale(${scale})">${glyphElements(glyph, "#FFFFFF")}</g>` +
		`</svg>\n`
	);
}

function write(relative, content) {
	const file = path.join(root, relative);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content);
}

/** [folder, list glyph] */
const actions = [
	["combat-next-turn", "nextTurn"],
	["combat-previous-turn", "previousTurn"],
	["combat-next-round", "nextRound"],
	["combat-previous-round", "previousRound"],
	["combat-start", "startCombat"],
	["pause", "pause"],
	["playlist-toggle", "music"],
	["playlist-next", "nextTurn"],
	["playlist-previous", "previousTurn"],
	["playlist-loop", "loop"],
	["playlist-stop-all", "stop"],
	["volume", "volume"],
];

for (const [folder, list] of actions) {
	write(`actions/${folder}/icon.svg`, listIcon(glyphs[list]));
}

write("plugin/category-icon.svg", listIcon(glyphs.d20).replace('width="20" height="20"', 'width="28" height="28"'));
write("plugin/marketplace.svg", keyImage(glyphs.d20, colors.combat).replace('width="144" height="144"', 'width="256" height="256"'));

console.log(`Icons written to ${root}`);
