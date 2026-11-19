const ZERO_WIDTH = /\u200B|\u200C|\u200D|\uFEFF/g;

// runs on every keystroke, so a trailing space or line break must survive
export function normalizeStoryText(value: string, multiline = false): string {
  const normalized = value.replace(ZERO_WIDTH, "");
  if (multiline) {
    return normalized
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n /g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+/, "");
  }
  return normalized.replace(/\s+/g, " ").trimStart();
}

export function finalizeStoryText(value: string, multiline = false): string {
  const normalized = normalizeStoryText(value, multiline);
  if (multiline) return normalized.replace(/ +\n/g, "\n").trim();
  return normalized.trim();
}
