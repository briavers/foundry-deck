import { describe, expect, it } from "vitest";

import { fitTitle, formatPercent } from "../src/actions/format";

describe("fitTitle", () => {
	it("keeps short names on one line", () => {
		expect(fitTitle("Goblin")).toBe("Goblin");
	});

	it("wraps words across lines", () => {
		expect(fitTitle("Goblin Boss")).toBe("Goblin\nBoss");
		expect(fitTitle("The Red Dragon")).toBe("The Red\nDragon");
	});

	it("truncates long words and extra lines", () => {
		expect(fitTitle("Tiamathrax")).toBe("Tiamathr…");
		expect(fitTitle("One Two Three Four Five Six Seven")).toBe("One Two\nThree\nFour Fiv…");
	});
});

describe("formatPercent", () => {
	it("rounds to whole percents", () => {
		expect(formatPercent(0.456)).toBe("46%");
	});
});
