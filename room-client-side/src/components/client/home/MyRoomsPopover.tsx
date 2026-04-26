"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AppIcon } from "@/components/icons/AppIcon";
import { useAuthToken } from "@/components/client/auth/useAuthToken";
import { deleteRoom, getMyRooms, type MyRoom } from "@/lib/api";
import { relativeFromIso } from "@/lib/youtube-api";
import { MyRoomsSkeleton } from "./MyRoomsSkeleton";

const ROOM_CAP = 5;

/**
 * Header-anchored popover listing the rooms the current user has
 * created. Each row links into the room and exposes a trash button to
 * delete it. The popover is the only UI surface for deletion, by
 * design — keeps the destructive action one extra hop away.
 *
 * Loading idiom: while the rooms list is being fetched, render
 * `<MyRoomsSkeleton />` so the user never sees a blank panel or a
 * spinner. Re-fetches every time the popover is opened so deletes /
 * room creations from another tab show up without a manual refresh.
 *
 * Click-outside / Escape close the popover. The trigger doubles as
 * a toggle.
 */
export function MyRoomsPopover() {
  const { hasToken } = useAuthToken();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Loading + data state. Reset whenever the popover opens so the
  // skeleton always shows on first paint of an open cycle.
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch on every open. Cancels via the standard "ignore stale result"
  // flag so a quick close-then-open doesn't race two fetches.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRooms(null);
    (async () => {
      const result = await getMyRooms();
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setRooms(result.rooms);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on click-outside / Escape — same idiom as RoomSettingsControl.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleDelete(roomId: string) {
    if (deletingId) return;
    if (!window.confirm("Delete this room? This can't be undone.")) return;
    setDeletingId(roomId);
    const result = await deleteRoom(roomId);
    setDeletingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setRooms((prev) => (prev ? prev.filter((r) => r.roomId !== roomId) : prev));
    toast.success("Room deleted");
  }

  if (!hasToken) return null;

  const count = rooms?.length ?? 0;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="My rooms"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="My rooms"
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card/90 text-muted shadow-sm transition hover:border-border hover:bg-card sm:h-10 sm:w-10"
      >
        <AppIcon
          icon="lucide:layers"
          className="h-[18px] w-[18px] sm:h-5 sm:w-5"
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="My rooms"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-card p-4 shadow-[0_10px_40px_-15px_rgba(15,23,42,0.18)] dark:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)]"
        >
          <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold tracking-tight text-foreground">
            <span>My rooms</span>
            {rooms ? (
              <span className="text-xs font-normal text-muted">
                {count}/{ROOM_CAP}
              </span>
            ) : null}
          </h2>

          {rooms === null ? (
            <MyRoomsSkeleton />
          ) : rooms.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted">
              You haven't created any rooms yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {rooms.map((r) => (
                <li key={r.roomId} className="group">
                  <div className="flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-muted/30 dark:hover:bg-zinc-800/40">
                    <Link
                      href={`/room/${r.roomId}?name=${encodeURIComponent(r.name)}`}
                      className="min-w-0 flex-1 outline-none"
                      onClick={() => setOpen(false)}
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        Last active {relativeFromIso(r.lastUsedAt)}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.roomId)}
                      disabled={deletingId === r.roomId}
                      aria-label={`Delete ${r.name}`}
                      title="Delete room"
                      className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                    >
                      <AppIcon
                        icon="lucide:trash-2"
                        className="h-4 w-4"
                        aria-hidden
                      />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
