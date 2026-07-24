import type { LegalDocBlock, LegalStrings } from "@/lib/i18n/dict";

export type DocBlock = LegalDocBlock;
export type LegalDocId = "privacy" | "terms";

export function legalDocsFrom(
  legal: LegalStrings,
): Record<LegalDocId, DocBlock[]> {
  return { privacy: legal.privacy, terms: legal.terms };
}
