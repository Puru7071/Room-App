"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { AppIcon } from "@/components/icons/AppIcon";
import { updateRoomMemberRole } from "@/lib/api";
import { initialsFromDisplayName } from "@/lib/display-name-initials";
import {
  CO_OWNER_ROLE,
  MEMBER_ROLE,
  OWNER_ADMIN_ROLE,
  type RoomMemberRow,
} from "@/lib/room-types";

const MAX_VISIBLE_OTHERS = 3;
const PANEL_WIDTH_PX = 340;

/** Distinct stacks for overlapping header chips (max three). */
const HEADER_FACE_GRADIENTS = [
  "bg-linear-to-br from-violet-500 via-fuchsia-500 to-rose-500 text-white shadow-[0_2px_8px_-2px_rgba(139,92,246,0.55)]",
  "bg-linear-to-br from-sky-400 via-blue-500 to-indigo-600 text-white shadow-[0_2px_8px_-2px_rgba(37,99,235,0.45)]",
  "bg-linear-to-br from-amber-400 via-orange-500 to-rose-600 text-white shadow-[0_2px_8px_-2px_rgba(234,88,12,0.45)]",
] as const;

function gradientClassForUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  return HEADER_FACE_GRADIENTS[Math.abs(h) % HEADER_FACE_GRADIENTS.length];
}

type PanelPos = { top: number; left: number; width: number };

type RoomMemberFacepileProps = {
  roomId?: string;
  members: RoomMemberRow[];
  isOwner?: boolean;
  /** Viewer can be highlighted if needed; chips now include everyone by default. */
  currentUserId?: string | null;
};

export function RoomMemberFacepile({
  roomId,
  members,
  isOwner = false,
  currentUserId = null,
}: RoomMemberFacepileProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const [busyByUserId, setBusyByUserId] = useState<Record<string, boolean>>({});
  const listId = useId();

  const sortedForList = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role === OWNER_ADMIN_ROLE && b.role !== OWNER_ADMIN_ROLE) return -1;
      if (b.role === OWNER_ADMIN_ROLE && a.role !== OWNER_ADMIN_ROLE) return 1;
      if (a.role === CO_OWNER_ROLE && b.role === MEMBER_ROLE) return -1;
      if (b.role === CO_OWNER_ROLE && a.role === MEMBER_ROLE) return 1;
      return a.userName.localeCompare(b.userName);
    });
  }, [members]);

  const toggleMemberRole = useCallback(
    async (member: RoomMemberRow) => {
      if (!roomId) return;
      if (member.role === OWNER_ADMIN_ROLE) return;
      if (busyByUserId[member.userId]) return;
      const nextRole = member.role === CO_OWNER_ROLE ? "VIEWER" : "SUB_LEADER";
      setBusyByUserId((prev) => ({ ...prev, [member.userId]: true }));
      try {
        const result = await updateRoomMemberRole(roomId, member.userId, nextRole);
        if (!result.ok) {
          toast.error(result.error);
        }
      } finally {
        setBusyByUserId((prev) => {
          const next = { ...prev };
          delete next[member.userId];
          return next;
        });
      }
    },
    [busyByUserId, roomId],
  );

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

  const visible = members.slice(0, MAX_VISIBLE_OTHERS);
  const overflow = Math.max(0, members.length - MAX_VISIBLE_OTHERS);
  const previewNames = sortedForList
    .slice(0, 5)
    .map((m) => m.userName)
    .join(", ");

  const soloInRoom = members.length === 1;

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
        className="rounded-2xl border border-border bg-card/95 p-2.5 shadow-[0_10px_40px_-15px_rgba(15,23,42,0.24)] backdrop-blur-sm dark:bg-zinc-900/95 dark:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.5)]"
      >
        <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-white">
          In this room ({members.length})
        </p>
        <ul className="max-h-64 list-none space-y-0 overflow-y-auto py-1">
          {sortedForList.map((m) => (
            <li
              key={m.userId}
              className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-2.5 px-1 py-2 text-left text-sm"
            >
              <span
                className={[
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-background text-xs font-semibold",
                  gradientClassForUserId(m.userId),
                ].join(" ")}
              >
                {initialsFromDisplayName(m.userName)}
              </span>
              <span className="min-w-0 flex items-center gap-2 truncate font-medium text-foreground">
                <span className="truncate">{m.userName}</span>
                {m.role === OWNER_ADMIN_ROLE || m.role === CO_OWNER_ROLE ? (
                  <span
                    className={[
                      "shrink-0 text-xs font-semibold uppercase tracking-wide",
                      "bg-linear-to-r bg-clip-text text-transparent",
                      m.role === OWNER_ADMIN_ROLE
                        ? "from-amber-300 via-orange-400 to-rose-400"
                        : "from-sky-300 via-cyan-300 to-violet-400",
                    ].join(" ")}
                  >
                    {m.role === OWNER_ADMIN_ROLE ? "owner" : "co-owner"}
                  </span>
                ) : null}
              </span>
              <div className="flex h-8 w-10 shrink-0 items-center justify-end">
                {isOwner &&
                m.role !== OWNER_ADMIN_ROLE &&
                m.userId !== currentUserId ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => void toggleMemberRole(m)}
                    disabled={busyByUserId[m.userId]}
                    aria-label={
                      m.role === CO_OWNER_ROLE
                        ? `Downvote ${m.userName}`
                        : `Upvote ${m.userName}`
                    }
                    title={
                      m.role === CO_OWNER_ROLE
                        ? "Demote from co-owner"
                        : "Promote to co-owner"
                    }
                    className={[
                      "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-transparent transition focus:outline-none",
                      "disabled:cursor-wait disabled:opacity-60",
                      m.role === CO_OWNER_ROLE
                        ? "text-rose-400 hover:text-rose-300"
                        : "text-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <AppIcon
                      icon="material-symbols:arrow-shape-up-stack"
                      className={[
                        "h-5 w-5",
                        m.role === CO_OWNER_ROLE ? "rotate-180 transform" : "",
                      ].join(" ")}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative shrink-0" tabIndex={-1}>
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        title={previewNames + (members.length > 5 ? "…" : "")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center rounded-full border-0 bg-transparent p-0.5 outline-none focus:outline-none focus-visible:outline-none"
      >
        <span className="flex items-center pl-0.5">
          {soloInRoom ? (
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-linear-to-br from-zinc-400 to-zinc-600 text-white shadow-sm sm:h-9 sm:w-9 dark:from-zinc-500 dark:to-zinc-800"
              aria-hidden
            >
              <AppIcon icon="lucide:users-round" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </span>
          ) : (
            <>
              {visible.map((m, i) => (
                <span
                  key={m.userId}
                  className={[
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold sm:h-9 sm:w-9 sm:text-[11px]",
                    gradientClassForUserId(m.userId),
                    i > 0 ? "-ml-2" : "",
                  ].join(" ")}
                  aria-hidden
                >
                  {initialsFromDisplayName(m.userName)}
                </span>
              ))}
              {overflow > 0 ? (
                <span
                  className="-ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-linear-to-br from-zinc-700 to-zinc-900 text-[10px] font-bold text-white shadow-sm sm:h-9 sm:w-9 sm:text-[11px] dark:from-zinc-600 dark:to-zinc-950"
                  aria-hidden
                >
                  +{overflow}
                </span>
              ) : null}
            </>
          )}
        </span>
      </button>

      {typeof document !== "undefined" && rosterPanel
        ? createPortal(rosterPanel, document.body)
        : null}
    </div>
  );
}
