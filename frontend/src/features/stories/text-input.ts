export function normalizeStoryText(value: string, multiline = false): string {
  const normalized = value.replace(/\u200B|\u200C|\u200D|\uFEFF/g, "");
  if (multiline) {
    return normalized
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");
  }
  return normalized.replace(/\s+/g, " ").trimStart();
}

export function finalizeStoryText(value: string, multiline = false): string {
  return normalizeStoryText(value, multiline).trim();
}
