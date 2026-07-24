import type { Metadata } from "next";

import { LegalPage } from "@/features/home/legal-page";

export const metadata: Metadata = { title: "Terms & Guidelines · Loci" };

export default function TermsPage() {
  return <LegalPage document="terms" />;
}
