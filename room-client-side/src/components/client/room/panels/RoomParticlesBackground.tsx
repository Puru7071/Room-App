"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import type { ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

/**
 * Shared particle background — colorful "growing" preset adapted from
 * the particles.js samples. Used across the side-panel tabs (Chat,
 * Queue, …) so they share a consistent ambient backdrop. Sits as an
 * absolute fill behind content; pointer-events are off on the canvas
 * so it never intercepts user input.
 *
 * Each consumer should pass a unique `id` since multiple instances
 * could co-exist (different panel tabs are mounted/unmounted but a
 * mounted-twice scenario from React strict-mode would otherwise share
 * an id).
 */

// Engine init is one-shot for the whole app — share the promise across
// mounts so tab switches don't re-run loadSlim.
let initPromise: Promise<void> | null = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }
  return initPromise;
}

type RoomParticlesBackgroundProps = {
  /** Unique element id for the canvas. Defaults to a generic value. */
  id?: string;
};

/**
 * Memoized so re-renders triggered by ancestor state changes (e.g. the
 * loop toggle in the queue panel header) don't propagate down here and
 * cause `<Particles>` to re-initialize its canvas — which would visibly
 * restart the drift animation. The only prop is `id`, a string literal
 * passed by each consumer; with shallow-equal props the memo bails out.
 */
function RoomParticlesBackgroundInner({
  id = "room-particles",
}: RoomParticlesBackgroundProps = {}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureInit().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo<ISourceOptions>(() => {
    // particles.js.org "growing" sample — colorful circles with
    // continuous size animation. Opacity kept low per requirement so
    // the chat content stays the focal point.
    return {
      fullScreen: { enable: false },
      background: { color: "transparent" },
      fpsLimit: 60,
      particles: {
        number: { value: 200, density: { enable: true, area: 800 } },
        color: {
          value: ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"],
        },
        shape: { type: "circle" },
        opacity: { value: 0.18 },
        size: {
          value: { min: 1, max: 30 },
          animation: {
            enable: true,
            speed: 5,
            sync: false,
            startValue: "min",
            destroy: "none",
          },
        },
        links: { enable: false },
        move: {
          enable: true,
          speed: 1,
          direction: "none",
          outModes: { default: "out" },
          random: false,
          straight: false,
        },
      },
      interactivity: {
        detectsOn: "parent",
        events: {
          resize: { enable: true },
        },
      },
      detectRetina: true,
    };
  }, []);

  if (!ready) return null;
  return (
    <Particles
      id={id}
      options={options}
      className="pointer-events-none absolute inset-0"
    />
  );
}

export const RoomParticlesBackground = memo(RoomParticlesBackgroundInner);
