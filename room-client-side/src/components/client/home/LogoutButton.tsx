"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AppIcon } from "@/components/icons/AppIcon";
import { useAuthToken } from "@/components/client/auth/useAuthToken";
import { disconnectSocket } from "@/lib/ws-client";

/**
 * Circular icon button placed beside the theme toggler. Same chrome dimensions
 * (h-9 w-9 sm:h-10 sm:w-10), border, and hover behaviour as
 * `HomeHeaderActions`'s theme toggler so the two visually pair up.
 *
 * Hidden when no token exists — both on first visit and after a logout —
 * so users who aren't signed in don't see a "log out" affordance.
 *
 * On click: clear the JWT from `localStorage` and fire a toast. The
 * `AuthGateForms` orchestrator subscribes to the same `useAuthToken` hook
 * and reacts to the cleared token by dropping back to its initial `gate`
 * mode. No page reload, no global auth context — the storage event the
 * hook emits is the cross-component signal.
 *
 * The JWT is stateless on the server; clearing it client-side is the
 * entire "logout." (See the auth-storage module for the rationale.)
 */
export function LogoutButton() {
  const router = useRouter();
  const { hasToken, clearToken } = useAuthToken();

  if (!hasToken) return null;

  function handleLogout() {
    // Tear the WebSocket down so the server cleans up its end. Done
    // before clearing the token so the singleton's `disconnect` call
    // still has a valid reference.
    disconnectSocket();
    clearToken();
    toast.success("You've been signed out");
    // Send the user home regardless of where the button was clicked. From
    // `/` this is a no-op; from `/room/<id>` it gets them off a route they
    // no longer have an auth token for.
    router.replace("/");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card/90 text-muted shadow-sm transition hover:border-border hover:bg-card sm:h-10 sm:w-10"
      aria-label="Log out"
      title="Log out"
    >
      <AppIcon
        icon="line-md:log-out"
        className="h-[18px] w-[18px] sm:h-5 sm:w-5"
        aria-hidden
      />
    </button>
  );
}
