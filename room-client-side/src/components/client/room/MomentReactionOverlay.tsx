"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import { subscribeMomentReactionBursts } from "@/components/client/room/momentReactionBus";

const BOTTOM_MIN_PX = 50;
const BOTTOM_SPREAD_PX = 10;
const PARTICLES_MIN = 4;
const PARTICLES_MAX = 5;

const ANCHOR_LEFT_PCT = [9, 21, 34, 48, 62, 76, 88];

function pickDistinctAnchors(count: number): number[] {
  const pool = [...ANCHOR_LEFT_PCT];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function burstParticleCount(): number {
  return (
    PARTICLES_MIN +
    Math.floor(Math.random() * (PARTICLES_MAX - PARTICLES_MIN + 1))
  );
}

/** Per-particle CSS variables for a four-stop glide path (no JS animation loop). */
function buildGlideVars(): Record<string, string> {
  const r = Math.random;
  const xa = (r() - 0.5) * 36;
  const xb = xa + (r() - 0.5) * 48;
  const xc = xb + (r() - 0.5) * 54;
  const xd = xc + (r() - 0.5) * 42;
  const lift = 248 + r() * 58;
  const y0 = 8 + r() * 10;
  const y1 = -36 - r() * 26;
  const y2 = -lift * 0.48 - r() * 38;
  const y3 = -lift - r() * 32;

  const rot0 = (r() - 0.5) * 26;
  const rot1 = rot0 + (r() - 0.5) * 30;
  const rot2 = rot1 + (r() - 0.5) * 34;
  const rot3 = rot2 + (r() - 0.5) * 28;

  const s0 = 0.58 + r() * 0.34;
  const s1 = s0 + 0.05 + r() * 0.12;
  const s2 = 0.86 + r() * 0.2;
  const s3 = 0.7 + r() * 0.22;

  const peak = 0.44 + r() * 0.54;
  const mid = peak * (0.88 + r() * 0.1);

  return {
    "--mr-x0": `${xa}px`,
    "--mr-x1": `${xb}px`,
    "--mr-x2": `${xc}px`,
    "--mr-x3": `${xd}px`,
    "--mr-y0": `${y0}px`,
    "--mr-y1": `${y1}px`,
    "--mr-y2": `${y2}px`,
    "--mr-y3": `${y3}px`,
    "--mr-r0": `${rot0}deg`,
    "--mr-r1": `${rot1}deg`,
    "--mr-r2": `${rot2}deg`,
    "--mr-r3": `${rot3}deg`,
    "--mr-s0": String(s0),
    "--mr-s1": String(s1),
    "--mr-s2": String(s2),
    "--mr-s3": String(s3),
    "--mr-o0": "0",
    "--mr-o1": String(peak),
    "--mr-o2": String(mid),
    "--mr-o3": "0",
  };
}

type ParticleRow = {
  instanceId: string;
  emoji: string;
  leftPct: number;
  bottomPx: number;
  delaySec: number;
  durationSec: number;
  vars: Record<string, string>;
  reduced: boolean;
};

function Particle({
  row,
  onDone,
}: {
  row: ParticleRow;
  onDone: () => void;
}) {
  const wrapStyle: CSSProperties = {
    left: `${row.leftPct}%`,
    bottom: row.bottomPx,
    transform: "translateX(-50%)",
  };

  const varsStyle: CSSProperties = {
    ...(row.vars as CSSProperties),
    animationDuration: `${row.durationSec}s`,
    animationDelay: `${row.delaySec}s`,
  };

  if (row.reduced) {
    return (
      <div className="pointer-events-none absolute" style={wrapStyle}>
        <span
          className="moment-reaction-soft-fade block origin-center select-none text-2xl leading-none sm:text-3xl"
          style={{
            animationDelay: `${row.delaySec}s`,
            animationDuration: `${row.durationSec}s`,
          }}
          onAnimationEnd={onDone}
        >
          {row.emoji}
        </span>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute" style={wrapStyle}>
      <span
        className="moment-reaction-glide block origin-center select-none text-2xl leading-none drop-shadow-[0_3px_14px_rgba(0,0,0,0.36)] sm:text-3xl"
        style={varsStyle}
        onAnimationEnd={onDone}
      >
        {row.emoji}
      </span>
    </div>
  );
}

type MomentReactionOverlayProps = {
  roomId: string;
};

function MomentReactionOverlayInner({ roomId }: MomentReactionOverlayProps) {
  const [particles, setParticles] = useState<ParticleRow[]>([]);
  const seenBurstIdsRef = useRef<Set<string>>(new Set());

  /** When returning to the tab, drop any paused/stale DOM — reactions are live-only. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setParticles([]);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const removeParticle = useCallback((instanceId: string) => {
    setParticles((prev) => prev.filter((p) => p.instanceId !== instanceId));
  }, []);

  const spawnBurst = useCallback((emoji: string, burstId: string) => {
    if (seenBurstIdsRef.current.has(burstId)) return;

    seenBurstIdsRef.current.add(burstId);
    if (seenBurstIdsRef.current.size > 400) {
      const arr = [...seenBurstIdsRef.current];
      seenBurstIdsRef.current = new Set(arr.slice(-200));
    }

    const n = burstParticleCount();
    const anchors = pickDistinctAnchors(n);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const next: ParticleRow[] = anchors.map((leftPct, i) => ({
      instanceId: `${burstId}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      emoji,
      leftPct,
      bottomPx: BOTTOM_MIN_PX + Math.random() * BOTTOM_SPREAD_PX,
      delaySec: i * 0.052 + Math.random() * 0.045,
      durationSec: reduced ? 0.48 : 2.95 + Math.random() * 0.55,
      vars: reduced ? {} : buildGlideVars(),
      reduced,
    }));

    setParticles((prev) => {
      const merged = [...prev, ...next];
      return merged.length <= 48 ? merged : merged.slice(-48);
    });
  }, []);

  useEffect(() => {
    seenBurstIdsRef.current.clear();
  }, [roomId]);

  useEffect(() => {
    const unsub = subscribeMomentReactionBursts(roomId, ({ emoji, burstId }) => {
      spawnBurst(emoji, burstId);
    });
    return unsub;
  }, [roomId, spawnBurst]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15] overflow-hidden rounded-xl"
      aria-hidden
    >
      {particles.map((row) => (
        <Particle
          key={row.instanceId}
          row={row}
          onDone={() => removeParticle(row.instanceId)}
        />
      ))}
    </div>
  );
}

export const MomentReactionOverlay = memo(MomentReactionOverlayInner);
