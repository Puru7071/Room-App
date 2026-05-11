"use client";

import { useAuthToken } from "@/components/client/auth/useAuthToken";
import { HEADER_CLUSTER_CIRCLE_LAYOUT } from "@/components/client/home/headerClusterStyles";

/**
 * Circular initials badge beside logout. Uses `HEADER_CLUSTER_CIRCLE_LAYOUT`
 * plus the same 1px border ring as the icon buttons so the outer radius
 * matches theme / share / gear / exit exactly.
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
      className={`${HEADER_CLUSTER_CIRCLE_LAYOUT} border border-border bg-linear-to-br from-blue-500 to-violet-500 text-xs font-semibold tracking-tight text-white shadow-sm select-none sm:text-sm`}
    >
      {initials}
    </div>
  );
}
