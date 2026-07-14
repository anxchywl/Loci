// Source-of-truth text for the in-app policy popups opened from the About panel.
// Kept deliberately short and plain, matching the product tone in docs/PRODUCT.md.
// English-only bodies; the link labels that point here are localized in dict.ts.

export type DocBlock =
  | { h: string }
  | { p: string }
  | { ul: string[] };

export type LegalDocId = "privacy" | "terms";

const LAST_UPDATED = "July 2025";

export const legalDocs: Record<LegalDocId, DocBlock[]> = {
  privacy: [
    { p: `Loci is a Telegram Mini App for pinning meaningful moments to places. This policy explains what we keep and why. Last updated ${LAST_UPDATED}.` },
    { h: "What we store" },
    { ul: [
      "Your Telegram account id and public profile (name, username, photo), used as your identity so you never create a separate account.",
      "The stories you publish: text, category, optional photos and date, and the location you choose.",
      "Reactions, bookmarks, and reports you make.",
    ] },
    { h: "Location" },
    { p: "You decide the location of every story. When you post approximately, we shift the pin by up to about 500 metres so an exact address is never revealed. Exact placement is opt-in, per story." },
    { h: "Anonymous posting" },
    { p: "You can publish any story without your name attached. We still link it to your account internally so you can edit or delete it, but it is never shown to other people." },
    { h: "What we never do" },
    { ul: [
      "We do not sell your data or show third-party ads.",
      "We do not track you across other apps or websites.",
      "We do not read your Telegram messages; the Mini App only receives what Telegram hands us at sign-in.",
    ] },
    { h: "Your control" },
    { p: "You can edit or delete any story you posted at any time; deleting removes it and its location from the map. To request removal of your account and all associated data, reach us through the links on the About screen." },
  ],
  terms: [
    { p: `By using Loci you agree to these terms and the community rules below. If you do not agree, please don't use the app. Last updated ${LAST_UPDATED}.` },
    { h: "Using Loci" },
    { p: "Loci is a place to share real, meaningful moments tied to real places. You are responsible for what you post and for having the right to share it, including any photos." },
    { h: "Your content" },
    { p: "You keep ownership of the stories you publish. By posting, you grant Loci permission to display your content on the map and share pages so the app can work. You can remove your content at any time." },
    { h: "Post what belongs here" },
    { ul: [
      "Real moments tied to real places: a memory, a dream, a discovery.",
      "Content you have the right to share.",
      "Locations chosen thoughtfully; use approximate placement for anything private.",
    ] },
    { h: "Please don't" },
    { ul: [
      "Post hateful, harassing, violent, or sexual content.",
      "Share other people's private information or exact home locations without consent.",
      "Spam, advertise, or post misleading or illegal content.",
      "Impersonate someone else.",
    ] },
    { h: "Moderation" },
    { p: "Anyone can report a story. Reported content may be hidden automatically pending review, and content that is illegal, that puts others at risk, or that repeatedly breaks these rules can lead to removal or account restrictions." },
    { h: "No warranty" },
    { p: "Loci is provided as-is, without guarantees of availability or accuracy. We are not liable for content posted by other people or for loss arising from use of the app." },
    { h: "Changes" },
    { p: "We may update these terms as the app evolves. Continued use after a change means you accept the updated terms." },
  ],
};
