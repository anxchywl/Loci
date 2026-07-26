import { describe, expect, it } from "vitest";

import { cleanEmailInput, cleanPasswordInput } from "@/features/auth/input";

describe("authentication input", () => {
  it("removes whitespace and invisible controls from email", () => {
    expect(cleanEmailInput(" \u200bperson @example.com\n")).toBe("person@example.com");
  });

  it("removes leading whitespace and controls from passwords", () => {
    expect(cleanPasswordInput(" \u0000\tcorrect horse battery staple")).toBe("correct horse battery staple");
  });

  it("keeps symbols that are safe in an opaque password", () => {
    expect(cleanPasswordInput("safe '\";<>& password")).toBe("safe '\";<>& password");
  });
});
