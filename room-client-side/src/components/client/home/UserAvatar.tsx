"use client";

import { useAuthToken } from "@/components/client/auth/useAuthToken";

/**
 * Small circular badge with the signed-in user's initials, sitting beside
 * the logout button in the header. Same chrome dimensions
 * (h-9 w-9 sm:h-10 sm:w-10) as the theme toggler / logout button so the
 * header row stays visually balanced.
 *
 * Hidden when no token exists, mirroring `LogoutButton`. The username is
 * read from the decoded JWT payload via `useAuthToken`.
 */
export function UserAvatar() {
  const { user } = useAuthToken();
  if (!user) return null;

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <div
      role="img"
      aria-label={`Signed in as ${user.username}`}
      title={user.username}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-semibold tracking-tight text-white shadow-sm select-none sm:h-10 sm:w-10 sm:text-sm"
    >
      {initials}
    </div>
  );
}
