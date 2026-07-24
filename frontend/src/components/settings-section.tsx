import type React from "react";

/**
 * One labelled group in the settings sheet, styled like the rest of the app:
 * a quiet caption over a filled `surface` block with hairline rows, the same
 * shape as the profile card. Every group is built from this so the sheet reads
 * as one list instead of each section inventing its own frame.
 */
export function SettingsSection({
  title,
  action,
  framed = true,
  children,
}: {
  title: string;
  /** optional trailing control in the caption row */
  action?: React.ReactNode;
  /** false for groups that are bare controls rather than a list of rows */
  framed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-end justify-between gap-2 px-1">
        <h2 className="text-[12px] font-medium text-muted">{title}</h2>
        {action}
      </div>
      {framed ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** A tappable or static row inside a framed section. */
export function SettingsRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex items-center gap-3 px-3.5 py-2.5 ${className}`}>{children}</div>;
}
