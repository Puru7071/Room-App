"use client";

import { useEffect, useRef, useState } from "react";

type GlowState = { x: number; y: number; active: boolean };

export default function AmbientMouseGlow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<GlowState>({ x: 0, y: 0, active: false });
  const [glow, setGlow] = useState<GlowState>({
    x: 0,
    y: 0,
    active: false,
  });

  useEffect(() => {
    const flush = () => {
      rafRef.current = null;
      setGlow({ ...pendingRef.current });
    };

    const onMove = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside =
        x >= 0 &&
        y >= 0 &&
        x <= rect.width &&
        y <= rect.height;
      pendingRef.current = { x, y, active: inside };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-2"
      aria-hidden
    >
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          opacity: glow.active ? 0.7 : 0,
          background: `radial-gradient(180px circle at ${glow.x}px ${glow.y}px, color-mix(in srgb, var(--accent-blue) 14%, transparent), transparent 55%)`,
        }}
      />
    </div>
  );
}
