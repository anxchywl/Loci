"use client";

/**
 * Tells the other tabs on this origin that the account they are showing is no
 * longer the one this browser is signed in to.
 *
 * Each tab bootstraps independently, so without this a second tab keeps serving
 * the previous account's cached data until its next request fails. The message
 * carries only the resolved `users.id` — never a token — and a tab acts on it
 * only when that id differs from the one it is showing, so two Telegram accounts
 * linked to the same Loci account do not disturb each other.
 */
export type AccountSignal = { userId: number | null };

const CHANNEL = "loci-auth";
// same-value writes do not fire `storage`, so the payload carries a nonce
const STORAGE_KEY = "loci_auth_signal";

type Listener = (signal: AccountSignal) => void;

function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL);
}

export function publishAccountSignal(signal: AccountSignal): void {
  const broadcast = channel();
  if (broadcast) {
    broadcast.postMessage(signal);
    broadcast.close();
    return;
  }
  // safari private mode and older webviews have no BroadcastChannel
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...signal, nonce: Date.now() + Math.random() }),
    );
  } catch {
    // storage unavailable: the other tab still corrects itself on its next 401
  }
}

function parse(raw: string | null): AccountSignal | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { userId?: unknown };
    const userId = value.userId;
    if (userId === null || typeof userId === "number") return { userId: userId ?? null };
  } catch {
    // a malformed entry is not a signal
  }
  return null;
}

export function subscribeToAccountSignals(listener: Listener): () => void {
  if (typeof window === "undefined") return () => {};

  const broadcast = channel();
  const onMessage = (event: MessageEvent<AccountSignal>) => {
    if (event.data && typeof event.data === "object") listener(event.data);
  };
  broadcast?.addEventListener("message", onMessage);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const signal = parse(event.newValue);
    if (signal) listener(signal);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    broadcast?.removeEventListener("message", onMessage);
    broadcast?.close();
    window.removeEventListener("storage", onStorage);
  };
}
