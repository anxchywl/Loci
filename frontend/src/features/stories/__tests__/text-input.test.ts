import { describe, expect, it } from "vitest";

import { finalizeStoryText, normalizeStoryText } from "@/features/stories/text-input";

// replays typing one character at a time through the keystroke normalizer
function type(text: string, multiline: boolean): string {
  return [...text].reduce((value, char) => normalizeStoryText(value + char, multiline), "");
}

describe("normalizeStoryText", () => {
  it("lets the user type spaces between words in a story body", () => {
    expect(type("It rained all evening", true)).toBe("It rained all evening");
  });

  it("lets the user start a new line and a new paragraph in a story body", () => {
    expect(type("First line\nSecond line\n\nNew paragraph", true)).toBe(
      "First line\nSecond line\n\nNew paragraph",
    );
  });

  it("keeps the space or line break just typed at the end", () => {
    expect(normalizeStoryText("Hello ", true)).toBe("Hello ");
    expect(normalizeStoryText("Hello\n", true)).toBe("Hello\n");
  });

  it("collapses repeated spaces and limits blank lines", () => {
    expect(normalizeStoryText("a    b", true)).toBe("a b");
    expect(normalizeStoryText("a\n\n\n\nb", true)).toBe("a\n\nb");
  });

  it("drops leading whitespace and zero-width characters", () => {
    expect(normalizeStoryText("  \n hi", true)).toBe("hi");
    expect(normalizeStoryText("a​b", true)).toBe("ab");
  });

  it("lets the user type spaces in a single-line title", () => {
    expect(type("First kiss", false)).toBe("First kiss");
  });
});

describe("finalizeStoryText", () => {
  it("trims the ends and trailing spaces on each line", () => {
    expect(finalizeStoryText("  one \ntwo  \n\n", true)).toBe("one\ntwo");
    expect(finalizeStoryText("  title  ")).toBe("title");
  });
});
