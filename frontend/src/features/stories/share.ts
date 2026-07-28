/**
 * Sharing a story hands out an ordinary web URL.
 *
 * The link is deliberately plain: opened from a Telegram chat it lands in a
 * browser like any other link, so a recipient without the app still reads the
 * story, and the mini app is a place the user chooses to go rather than
 * somewhere a share drops them.
 */

/** the canonical public link to a story, resolved by its share token */
export function storyShareUrl(shareToken: string): string {
  return `${window.location.origin}/?s=${shareToken}`;
}

/**
 * Offers the system share sheet where there is one, and copies otherwise.
 * Resolves to true when the link was copied, so the caller can say so.
 */
export async function shareStoryLink(
  shareToken: string,
  { title, text }: { title?: string; text: string },
): Promise<boolean> {
  const url = storyShareUrl(shareToken);

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return false;
    } catch (err) {
      // dismissing the sheet is a decision, not a failure to fall back from
      if ((err as Error).name === "AbortError") return false;
    }
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return true;
}
