"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { resolveUserName, updateDisplayName, type AuthUser } from "@/features/auth/api";
import { ApiError } from "@/lib/api";
import { useDict } from "@/lib/i18n/use-dict";
import { useAuthStore } from "@/stores/auth-store";

const UNSAFE_INPUT_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

function cleanNameInput(value: string): string {
  return value.normalize("NFC").replace(UNSAFE_INPUT_RE, "").replace(/[\r\n]+/g, " ");
}

function NameEditor({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const t = useDict();
  const qc = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  const [value, setValue] = useState(user.display_name ?? resolveUserName(user));
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const name = resolveUserName(user);

  useEffect(() => inputRef.current?.select(), []);

  const save = useMutation({
    mutationFn: (next: string) => updateDisplayName(next),
    onSuccess: (updated) => {
      updateUser(updated);
      onClose();
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["stories"] });
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-name-title">
      <button aria-label={t.cancel} onClick={onClose} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
      <form
        onSubmit={(event) => { event.preventDefault(); commit(); }}
        className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-name-title" className="text-[17px] font-semibold">{t.editName}</h2>
            <p className="mt-1 text-[13px] text-muted">{t.namePlaceholder}</p>
          </div>
          <button type="button" onClick={onClose} disabled={save.isPending} aria-label={t.cancel} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-60">
            <X size={18} />
          </button>
        </div>
        <input
          ref={inputRef}
          value={value}
          maxLength={50}
          autoComplete="off"
          spellCheck={false}
          placeholder={t.namePlaceholder}
          onChange={(event) => setValue(cleanNameInput(event.target.value))}
          disabled={save.isPending}
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] disabled:opacity-60"
        />
        {error && <p role="alert" className="mt-2 text-[12px] text-[var(--lm-danger,#dc2626)]">{t.nameSaveError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={save.isPending} className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface disabled:opacity-60">
            {t.cancel}
          </button>
          <button type="submit" disabled={save.isPending} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-60">
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            {t.save}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function EditableName({ user, className = "" }: { user: AuthUser; className?: string }) {
  const t = useDict();
  const name = resolveUserName(user);
  return <span className={`truncate text-[15px] font-bold text-text ${className}`}>{name || t.profile}</span>;
}

export function ChangeNameButton({ user }: { user: AuthUser }) {
  const t = useDict();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-[13px] font-semibold text-accent transition-colors hover:text-accent/80">
        {t.changeName}
      </button>
      {editing && <NameEditor user={user} onClose={() => setEditing(false)} />}
    </>
  );
}
