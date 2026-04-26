"use client";

import { useAuthToken } from "@/components/client/auth/useAuthToken";
import { GlobalLoader } from "@/components/layout/GlobalLoader";

/**
 * Covers the home page with the global loader until `useAuthToken`
 * finishes its initial localStorage read. Without this gate the page
 * briefly shows the signed-out gate UI before snapping to the
 * rooms-gate (or vice versa) when the JWT resolves.
 *
 * **Why not Next.js' `app/loading.tsx`?** Route-level loaders only run
 * during route transitions / server data fetches — they don't help with
 * client-only state like a JWT in `localStorage`. So we mount the same
 * `<GlobalLoader />` here as an overlay on top of the home page during
 * the brief window before `ready` flips to `true`.
 *
 * The home page's actual content is rendered underneath in the same
 * paint, so when this overlay unmounts there is no layout shift — the
 * content is already in place.
 */
export function HomeAuthLoadingOverlay() {
  const { ready } = useAuthToken();
  if (ready) return null;
  return <GlobalLoader />;
}
