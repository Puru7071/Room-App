"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { initialsFromDisplayName } from "@/lib/display-name-initials";
import { OWNER_ADMIN_ROLE, type RoomMemberRow } from "@/lib/room-types";

const MAX_VISIBLE = 2;
const PANEL_WIDTH_PX = 288;

type PanelPos = { top: number; left: number; width: number };

type RoomMemberFacepileProps = {
  members: RoomMemberRow[];
};

export function RoomMemberFacepile({ members }: RoomMemberFacepileProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  const updatePanelPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const width = Math.min(PANEL_WIDTH_PX, Math.max(240, vw - 16));
    let left = r.right - width;
    left = Math.max(8, Math.min(left, vw - width - 8));
    setPanelPos({ top: r.bottom + 6, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePanelPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, close]);

  if (members.length === 0) return null;

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, members.length - MAX_VISIBLE);
  const previewNames = members
    .slice(0, 5)
    .map((m) => m.userName)
    .join(", ");

  const rosterPanel =
    open && panelPos ? (
      <div
        ref={panelRef}
        id={listId}
        role="dialog"
        aria-label="People in this room"
        style={{
          position: "fixed",
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          zIndex: 200,
        }}
        className="rounded-xl border border-border bg-card py-2 shadow-lg dark:bg-zinc-900"
      >
        <p className="border-b border-border px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          In this room ({members.length})
        </p>
        <ul className="max-h-64 list-none space-y-0 overflow-y-auto py-1">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-zinc-200 to-zinc-300 text-xs font-semibold text-zinc-800 dark:from-zinc-600 dark:to-zinc-700 dark:text-zinc-100">
                {initialsFromDisplayName(m.userName)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {m.userName}
              </span>
              {m.role === OWNER_ADMIN_ROLE ? (
                <span className="shrink-0 rounded-md border border-border bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  Owner
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title={previewNames + (members.length > 5 ? "…" : "")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center rounded-full border-0 bg-transparent p-0.5 outline-none ring-accent-blue/40 focus-visible:ring-2 focus-visible:ring-offset-0"
      >
        <span className="flex items-center pl-0.5">
          {visible.map((m, i) => (
            <span
              key={m.userId}
              className={[
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-linear-to-b from-zinc-200 to-zinc-300 text-[10px] font-semibold text-zinc-800 shadow-sm sm:h-9 sm:w-9 sm:text-[11px] dark:from-zinc-600 dark:to-zinc-700 dark:text-zinc-100",
                i > 0 ? "-ml-2" : "",
              ].join(" ")}
              aria-hidden
            >
              {initialsFromDisplayName(m.userName)}
            </span>
          ))}
          {overflow > 0 ? (
            <span
              className="-ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-amber-200 text-[10px] font-bold text-zinc-900 shadow-sm sm:h-9 sm:w-9 sm:text-[11px] dark:bg-amber-300/90 dark:text-zinc-950"
              aria-hidden
            >
              +{overflow}
            </span>
          ) : null}
        </span>
      </button>

      {typeof document !== "undefined" && rosterPanel
        ? createPortal(rosterPanel, document.body)
        : null}
    </div>
  );
}
