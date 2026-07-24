import type { Metadata } from "next";

import { LegalPage } from "@/features/home/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Loci" };

export default function PrivacyPage() {
  return <LegalPage document="privacy" />;
}
