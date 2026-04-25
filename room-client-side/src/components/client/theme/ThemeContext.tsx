"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  applyHtmlClass,
  emitThemeChange,
  getDocumentTheme,
  readRevealFillForTheme,
  subscribeThemeChange,
  writeStoredTheme,
  type ThemePreference,
} from "@/lib/theme-preference";

export type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: (clientX: number, clientY: number) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function getServerSnapshot(): ThemePreference {
  return "dark";
}

function getSnapshot(): ThemePreference {
  return getDocumentTheme();
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type OverlayState = {
  clientX: number;
  clientY: number;
  fill: string;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeThemeChange,
    getSnapshot,
    getServerSnapshot,
  );
  const toggleBusy = useRef(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayNextRef = useRef<ThemePreference | null>(null);

  const commit = useCallback((next: ThemePreference) => {
    applyHtmlClass(next);
    writeStoredTheme(next);
    emitThemeChange();
  }, []);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      commit(next);
    },
    [commit],
  );

  const toggleTheme = useCallback(
    (clientX: number, clientY: number) => {
      if (toggleBusy.current) return;

      const current = getDocumentTheme();
      const next: ThemePreference = current === "dark" ? "light" : "dark";
      const root = document.documentElement;
      root.style.setProperty("--theme-reveal-x", `${clientX}px`);
      root.style.setProperty("--theme-reveal-y", `${clientY}px`);

      if (prefersReducedMotion()) {
        commit(next);
        return;
      }

      if (typeof document.startViewTransition === "function") {
        toggleBusy.current = true;
        const vt = document.startViewTransition(() => {
          commit(next);
        });
        void vt.finished.finally(() => {
          toggleBusy.current = false;
        });
        return;
      }

      const fill = readRevealFillForTheme(next);
      toggleBusy.current = true;
      overlayNextRef.current = next;
      setOverlay({ clientX, clientY, fill });
    },
    [commit],
  );

  useEffect(() => {
    if (!overlay) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const node = overlayRef.current;
        if (!node) return;
        node.style.transition = "clip-path 0.42s ease-out";
        node.style.clipPath = `circle(150vmax at ${overlay.clientX}px ${overlay.clientY}px)`;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [overlay]);

  const onOverlayTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "clip-path") return;
      const next = overlayNextRef.current;
      overlayNextRef.current = null;
      toggleBusy.current = false;
      setOverlay(null);
      if (next) commit(next);
    },
    [commit],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  const portal =
    overlay &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={overlayRef}
        role="presentation"
        className="pointer-events-none fixed inset-0 z-[9999]"
        style={{
          backgroundColor: overlay.fill,
          clipPath: `circle(0px at ${overlay.clientX}px ${overlay.clientY}px)`,
        }}
        onTransitionEnd={onOverlayTransitionEnd}
      />,
      document.body,
    );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {portal}
    </ThemeContext.Provider>
  );
}
