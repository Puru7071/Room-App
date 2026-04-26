"use client";

import { useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import type { ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

/**
 * Particle background for the chat panel — bubble preset matching the
 * particles.js demo (vincentgarreau.com/particles.js#bubble). Sits behind
 * the chat content as an absolute fill; hover/click are detected on the
 * parent container so particles can bubble without intercepting input.
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

export function ChatParticlesBackground() {
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
      id="chat-particles"
      options={options}
      className="pointer-events-none absolute inset-0"
    />
  );
}
