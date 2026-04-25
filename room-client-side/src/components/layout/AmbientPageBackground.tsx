import dynamic from "next/dynamic";

const AmbientMouseGlowDynamic = dynamic(
  () => import("@/components/layout/AmbientMouseGlow"),
  { loading: () => null },
);

type AmbientPageBackgroundProps = {
  /** Soft spotlight that follows the pointer (loads its client chunk only when true). */
  mouseShadow?: boolean;
};

/**
 * Decorative layers (radial wash, grid, soft orbs). Parent must establish
 * positioning (`relative`, `fixed`, etc.) so `absolute inset-0` layers align.
 *
 * Server Component. Optional glow uses `next/dynamic(() => import(...))` so it
 * is a separate async chunk; it only mounts when `mouseShadow` is true. (Next.js
 * 16 does not allow `ssr: false` on `dynamic` inside Server Components.)
 */
export function AmbientPageBackground({
  mouseShadow = false,
}: AmbientPageBackgroundProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--glow-blue),transparent)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] bg-[size:44px_44px]"
        aria-hidden
      />
      <div
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--glow-orb)] blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[var(--glow-orb)] blur-3xl opacity-70"
        aria-hidden
      />
      {mouseShadow ? <AmbientMouseGlowDynamic /> : null}
    </div>
  );
}
