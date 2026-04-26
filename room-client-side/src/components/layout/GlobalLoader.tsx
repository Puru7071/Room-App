import Image from "next/image";
import { AmbientPageBackground } from "@/components/layout/AmbientPageBackground";
import { APP_DISPLAY_NAME } from "@/lib/app-constants";

/**
 * Full-screen route loader. Mounted by Next.js' `app/loading.tsx`
 * during route transitions, and used as an overlay during client-side
 * auth resolution on the home page.
 *
 * Layers:
 *   1. Background — the same `AmbientPageBackground` (radial wash +
 *      grid + soft orbs) that the home page uses, so the loader
 *      visually matches the rest of the app.
 *   2. Frosted overlay — `bg-background/70 backdrop-blur-sm` softens
 *      the pattern so the centered content reads cleanly.
 *   3. Content — logo + brand wordmark + sliding loading bar.
 *
 * Theme-aware throughout: ambient pattern + overlay + bar all flip
 * via CSS variables / `dark:` modifiers. Logo plate stays white in
 * both themes (same treatment as the home header).
 */
export function GlobalLoader() {
  return (
    <div className="fixed inset-0 z-[101] flex h-screen w-screen items-center justify-center overflow-hidden bg-background text-foreground">
      <AmbientPageBackground />
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        aria-hidden
      />

      <div className="relative z-10 flex flex-col items-center justify-center gap-10">
        {/* Logo + brand — same composition as the home header: tiny
            white plate around the mark, text alongside on the page
            surface. Width/height props match the displayed size so the
            <img> doesn't briefly render at the intrinsic size before
            CSS clamps it (which produced the "expand then shrink"
            flicker). */}
        <div className="flex items-center gap-5">
          <div className="rounded-md bg-white p-1 shadow-[1px_1px_1px_rgba(0,0,0,0.2)]">
            <Image
              src="/logo-mark.png"
              alt=""
              width={40}
              height={40}
              className="block h-10 w-10 object-contain"
              unoptimized
              priority
              aria-hidden={true}
            />
          </div>
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {APP_DISPLAY_NAME}
          </span>
        </div>

        <div className="h-2 w-64 overflow-hidden rounded-full bg-zinc-200 shadow-inner dark:bg-zinc-800">
          <div className="room-loading-bar h-full rounded-full bg-zinc-600 dark:bg-zinc-300" />
        </div>
      </div>
    </div>
  );
}
