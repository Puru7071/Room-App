"use client";

import { useEffect, useState } from "react";
import {
  AUTH_TOKEN_KEY,
  type AuthTokenUser,
  clearAuthToken,
  decodeJwtPayload,
  getAuthToken,
} from "@/lib/auth-storage";

/**
 * React hook that exposes whether an auth token is currently present in
 * `localStorage`, the decoded user payload, plus a callback to clear it.
 *
 * Listens to the `storage` event so:
 *   - the button hides immediately after a same-tab logout, and
 *   - the same is true across tabs (logout in tab A, button hides in tab B).
 *
 * SSR-safe: starts as `false`/`null` and re-checks on mount. Callers
 * that need to avoid a "wrong UI flash" between the initial render and
 * the post-mount localStorage read should gate on `ready` — it flips
 * to `true` once the first read completes.
 */
export function useAuthToken() {
  const [hasToken, setHasToken] = useState(false);
  const [user, setUser] = useState<AuthTokenUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function refresh() {
      const token = getAuthToken();
      setHasToken(token !== null);
      setUser(token ? decodeJwtPayload(token) : null);
      setReady(true);
    }
    refresh();

    function onStorage(event: StorageEvent) {
      if (event.key !== AUTH_TOKEN_KEY && event.key !== null) return;
      refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function clearToken() {
    clearAuthToken();
    setHasToken(false);
    setUser(null);
    // The native `storage` event only fires across tabs, not in the same tab.
    // Other components that mount their own `useAuthToken` need a same-tab
    // signal — emit one synthetically so they re-read.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", { key: AUTH_TOKEN_KEY, newValue: null }),
      );
    }
  }

  return { hasToken, user, ready, clearToken };
}
