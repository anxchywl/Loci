"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { resolveUserName, updateDisplayName, type AuthUser } from "@/features/auth/api";
import { ApiError } from "@/lib/api";
import { useDict } from "@/lib/i18n/use-dict";
import { useAuthStore } from "@/stores/auth-store";

export function EditableName({ user, className = "" }: { user: AuthUser; className?: string }) {
  const t = useDict();
  const qc = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const name = resolveUserName(user);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = useMutation({
    mutationFn: (next: string) => updateDisplayName(next),
    onSuccess: (updated) => {
      updateUser(updated);
      setEditing(false);
      // author labels on the user's own stories change with the name
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["stories"] });
    },
    onError: (err) => setError(!(err instanceof ApiError && err.status === 422)),
  });

  const begin = () => {
    setValue(user.display_name ?? name);
    setError(false);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setError(false);
    save.mutate(trimmed);
  };

  if (!editing) {
    return (
      <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
        <span className="truncate text-[15px] font-bold text-text">{name || t.profile}</span>
        <button
          onClick={begin}
          aria-label={t.editName}
          className="shrink-0 text-muted transition-colors hover:text-accent focus-visible:text-accent"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-name-title">
      <button
        aria-label={t.cancel}
        onClick={() => setEditing(false)}
        className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in"
      />
      <form
        onSubmit={(event) => { event.preventDefault(); commit(); }}
        className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-name-title" className="text-[17px] font-semibold">{t.editName}</h2>
            <p className="mt-1 text-[13px] text-muted">{t.namePlaceholder}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={save.isPending}
            aria-label={t.cancel}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-60"
          >
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
          onChange={(e) => setValue(e.target.value)}
          disabled={save.isPending}
          className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] disabled:opacity-60"
        />
        {error && <p role="alert" className="mt-2 text-[12px] text-[var(--lm-danger,#dc2626)]">{t.nameSaveError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={save.isPending}
            className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface disabled:opacity-60"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-60"
          >
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            {t.save}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
