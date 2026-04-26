/**
 * Centralized helpers for the auth-token stored in `localStorage`.
 *
 * The token itself is a JWT issued by `POST /auth/verify-otp` (and, in the
 * future, `POST /auth/login`). Logout is purely client-side — there's no
 * `/auth/logout` endpoint to call. Once the token is cleared from storage,
 * the browser has no way to make further authenticated requests; the JWT
 * remains valid until its `exp` claim, but no one holds it any more.
 *
 * Wrapping every read/write/delete in this module also gives us a single
 * place to harden against private-mode Safari (which throws on any
 * `localStorage` access from cross-origin iframes / strict-cookies setups).
 */

export const AUTH_TOKEN_KEY = "roomapp.authToken";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Some private-mode browsers throw on setItem; non-fatal here.
  }
  // The native `storage` event only fires across tabs, not in the same tab.
  // `useAuthToken` instances in this tab need a same-tab signal to flip
  // `hasToken` to true — emit one synthetically so they re-read.
  try {
    window.dispatchEvent(
      new StorageEvent("storage", { key: AUTH_TOKEN_KEY, newValue: token }),
    );
  } catch {
    /* noop */
  }
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export type AuthTokenUser = { userId: string; username: string };

/**
 * Decodes the JWT payload (the middle segment) without verifying the
 * signature — verification is the server's job; on the client we just need
 * the public claims (userId, username) for UI like the header avatar.
 *
 * Returns null on any malformation: wrong segment count, bad base64,
 * non-JSON, missing fields, or wrong field types. Callers should treat
 * null as "treat user as anonymous" rather than crashing.
 */
export function decodeJwtPayload(token: string): AuthTokenUser | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const segment = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const data: unknown = JSON.parse(json);
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as { userId?: unknown }).userId !== "string" ||
      typeof (data as { username?: unknown }).username !== "string"
    ) {
      return null;
    }
    const d = data as AuthTokenUser;
    return { userId: d.userId, username: d.username };
  } catch {
    return null;
  }
}
