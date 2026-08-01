"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { resolveUserName, updateDisplayName, type AuthUser } from "@/features/auth/api";
import { ApiError } from "@/lib/api";
import { useDict } from "@/lib/i18n/use-dict";
import { useAuthStore } from "@/stores/auth-store";
import { queryKeys } from "@/lib/query/cache-policy";
import { useAccountMutation } from "@/lib/query/account-mutation";

const UNSAFE_INPUT_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

function cleanNameInput(value: string): string {
  return value.normalize("NFC").replace(UNSAFE_INPUT_RE, "").replace(/[\r\n]+/g, " ");
}

export interface NameEditorSheet {
  setView: (view: { title: string; onBack: () => void } | null) => void;
  transition: (apply: () => void) => void;
}

export function NameEditor({ user, onClose, inline = false }: { user: AuthUser; onClose: () => void; inline?: boolean }) {
  const t = useDict();
  const qc = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  const [value, setValue] = useState(user.display_name ?? resolveUserName(user));
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const name = resolveUserName(user);

  useEffect(() => inputRef.current?.select(), []);

  const save = useAccountMutation({
    mutationFn: (next: string) => updateDisplayName(next),
    onSuccess: (updated) => {
      updateUser(updated);
      onClose();
      void qc.invalidateQueries({ queryKey: queryKeys.profile.root });
      void qc.invalidateQueries({ queryKey: queryKeys.stories.root });
    },
    onError: (err) => setError(!(err instanceof ApiError && err.status === 422)),
  });

  const commit = () => {
    const trimmed = cleanNameInput(value).replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed === name) {
      onClose();
      return;
    }
    setError(false);
    save.mutate(trimmed);
  };

  const content = (
    <div className={inline ? "flex flex-col gap-3" : "fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 motion-safe:animate-fade-in"} role="dialog" aria-modal="true" aria-labelledby="edit-name-title">
      <form
        onSubmit={(event) => { event.preventDefault(); commit(); }}
        className={inline
          ? "flex flex-col gap-3"
          : "relative w-full max-w-sm rounded-sheet border border-border bg-bg p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in"}
      >
        <h2 id="edit-name-title" className="text-[17px] font-semibold">{t.editName}</h2>
        <input
          ref={inputRef}
          value={value}
          maxLength={50}
          autoComplete="off"
          spellCheck={false}
          placeholder={t.namePlaceholder}
          onChange={(event) => setValue(cleanNameInput(event.target.value).replace(/^\s+/, ""))}
          disabled={save.isPending}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] disabled:opacity-60"
        />
        {error && <p role="alert" className="mt-2 text-[12px] text-[var(--lm-danger,#dc2626)]">{t.nameSaveError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={save.isPending} className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface disabled:opacity-60">
            {t.cancel}
          </button>
          <button type="submit" disabled={save.isPending} className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-60">
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            {t.save}
          </button>
        </div>
      </form>
    </div>
  );

  if (inline || typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

export function EditableName({ user, className = "" }: { user: AuthUser; className?: string }) {
  const t = useDict();
  const name = resolveUserName(user);
  return <span className={`truncate text-[15px] font-bold text-text ${className}`}>{name || t.profile}</span>;
}

export function ChangeNameButton({
  user,
  iconOnly = false,
  sheet,
  onEditStateChange,
}: {
  user: AuthUser;
  iconOnly?: boolean;
  sheet?: NameEditorSheet;
  onEditStateChange?: (editing: boolean) => void;
}) {
  const t = useDict();
  const [editing, setEditing] = useState(false);
  const close = () => {
    if (sheet) sheet.transition(() => {
      setEditing(false);
      onEditStateChange?.(false);
      sheet.setView(null);
    });
    else {
      setEditing(false);
      onEditStateChange?.(false);
    }
  };
  const begin = () => {
    if (sheet) sheet.transition(() => {
      setEditing(true);
      onEditStateChange?.(true);
      sheet.setView({ title: t.editName, onBack: close });
    });
    else {
      setEditing(true);
      onEditStateChange?.(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={begin}
        aria-label={iconOnly ? t.editName : undefined}
        className={iconOnly
          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-accent focus-visible:bg-surface focus-visible:text-accent"
          : "shrink-0 text-[13px] font-semibold text-accent transition-colors hover:text-accent/80"}
      >
        {iconOnly ? <Pencil size={17} /> : t.changeName}
      </button>
      {editing && !onEditStateChange && <NameEditor user={user} onClose={close} />}
    </>
  );
}
