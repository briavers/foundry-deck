/**
 * Word-wraps text so it fits on a 72×72 key: at most `maxLines` lines of `lineLength`
 * characters, truncating with "…" when it doesn't fit.
 */
export function fitTitle(text: string, lineLength = 9, maxLines = 3): string {
	const words = text.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= lineLength) {
			current = candidate;
			continue;
		}
		if (current) lines.push(current);
		current = word.length > lineLength ? `${word.slice(0, lineLength - 1)}…` : word;
	}
	if (current) lines.push(current);

	if (lines.length > maxLines) {
		const kept = lines.slice(0, maxLines);
		const last = kept[maxLines - 1];
		kept[maxLines - 1] = last.length >= lineLength ? `${last.slice(0, lineLength - 1)}…` : `${last}…`;
		return kept.join("\n");
	}
	return lines.join("\n");
}

export function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}
