"use client";

import type { DocBlock, LegalDocId } from "./legal-content";

/** Title lookup for the in-panel document header, kept in one place. */
export function docTitlesFrom(
  t: { aboutPrivacyPolicy: string; aboutTerms: string },
): Record<LegalDocId, string> {
  return { privacy: t.aboutPrivacyPolicy, terms: t.aboutTerms };
}

/**
 * Renders a legal document's body inside the current panel/sheet.
 * The header (back button + centered title) is owned by the container,
 * so this is content-only.
 */
export function DocView({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="px-4 py-4 animate-fade-in">
      {blocks.map((block, i) => {
        if ("h" in block) {
          return (
            <div key={i} className="mb-1.5 mt-5 text-[14px] font-semibold first:mt-0">
              {block.h}
            </div>
          );
        }
        if ("ul" in block) {
          return (
            <ul key={i} className="mb-3 space-y-1.5 pl-1">
              {block.ul.map((li, j) => (
                <li key={j} className="flex gap-2 text-[14px] leading-relaxed text-muted">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted/60" />
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mb-3 text-[14px] leading-relaxed text-muted">
            {block.p}
          </p>
        );
      })}
    </div>
  );
}
