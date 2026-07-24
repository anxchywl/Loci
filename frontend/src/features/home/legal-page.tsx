"use client";

import Link from "next/link";

import { DocView } from "@/features/home/doc-view";
import { legalDocsFrom, type LegalDocId } from "@/features/home/legal-content";
import { locales } from "@/lib/i18n/dict";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export function LegalPage({ document }: { document: LegalDocId }) {
  const t = useDict();
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  const title = document === "privacy" ? t.aboutPrivacyPolicy : t.aboutTerms;

  return (
    <main className="min-h-dvh bg-bg px-4 py-8 text-text">
      <article className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-[13px] font-medium text-accent">
            {t.legal.backHome}
          </Link>
          <div className="flex gap-1" aria-label={t.languageLabel}>
            {locales.map((item) => (
              <button
                key={item}
                onClick={() => setLocale(item)}
                aria-pressed={locale === item}
                className={`rounded px-2 py-1 text-[12px] uppercase ${locale === item ? "bg-accent text-accent-text" : "text-muted"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <h1 className="mt-8 px-4 text-[28px] font-semibold tracking-tight">{title}</h1>
        <DocView blocks={legalDocsFrom(t.legal)[document]} />
        <section className="mx-4 mt-3 border-t border-border pt-5">
          <h2 className="text-[14px] font-semibold">{t.legal.contact}</h2>
          {SUPPORT_EMAIL ? (
            <a className="mt-2 inline-block text-[14px] text-accent" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          ) : (
            <p className="mt-2 text-[14px] text-muted">{t.legal.contactUnavailable}</p>
          )}
        </section>
      </article>
    </main>
  );
}
