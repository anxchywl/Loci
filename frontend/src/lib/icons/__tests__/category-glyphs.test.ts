import { describe, expect, it } from "vitest";

import { categoryPinSvg } from "@/lib/icons/category-glyphs";

describe("category pin svg", () => {
  it("keeps the production teardrop and category glyph treatment", () => {
    const svg = categoryPinSvg("travel", "#0BA5EC");

    expect(svg).toContain('fill="#0BA5EC"');
    expect(svg).toContain('d="M15 43 L3.5 21 A13 13 0 1 1 26.5 21 Z"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).not.toContain("linearGradient");
    expect(svg).not.toContain("feDropShadow");
  });
});
