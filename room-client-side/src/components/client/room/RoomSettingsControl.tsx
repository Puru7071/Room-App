"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import { HEADER_CLUSTER_CIRCLE_LAYOUT } from "@/components/client/home/headerClusterStyles";
import { getRoomStore, useRoomStore } from "@/components/client/room/store/roomStore";
import { AppIcon } from "@/components/icons/AppIcon";
import {
  type RoomSettingsDetail,
  type UpdateRoomSettingsArgs,
  updateRoomSettings,
} from "@/lib/api";

type RoomSettingsControlProps = {
  roomId: string;
};

/**
 * Circular gear button + popover panel of room settings. Visibility is
 * gated upstream (elevated members: creator or co-owner). All visible
 * rows assume edit permission and fire PATCH on toggle.
 *
 * Each toggle uses an optimistic update — flips the row immediately,
 * then PATCHes; on failure it reverts and toasts the error. The panel
 * stays open through the request so users can flip multiple toggles
 * without re-opening it.
 *
 * The popover anchors to the button's right edge (`right-0 top-full`)
 * so it doesn't overflow the viewport. Closes on click-outside,
 * Escape, or a second click on the trigger.
 */
export function RoomSettingsControl({ roomId }: RoomSettingsControlProps) {
  /** Popover rows only — avoids rerenders when unrelated settings (e.g. loop) change. */
  const panel = useRoomStore(
    roomId,
    useShallow((s) => {
      const rs = s.roomSettings;
      if (!rs) return null;
      return {
        nature: rs.nature,
        chatRights: rs.chatRights,
        videoAudioRights: rs.videoAudioRights,
      };
    }),
  );
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  if (!panel) return null;

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

  async function applyPatch(patch: UpdateRoomSettingsArgs, prev: RoomSettingsDetail) {
    const result = await updateRoomSettings(roomId, patch);
    if (!result.ok) {
      // Revert to pre-toggle server snapshot on failure.
      getRoomStore(roomId).getState().setRoomSettings(prev);
      toast.error(result.error);
      return;
    }
    // Reconcile to server truth (also mirrored by WS `room.settings.updated`).
    getRoomStore(roomId).getState().setRoomSettings(result.settings);
  }

  function toggleNature(nextOn: boolean) {
    const prev = getRoomStore(roomId).getState().roomSettings;
    if (!prev) return;
    const next: RoomSettingsDetail = {
      ...prev,
      nature: nextOn ? "PRIVATE" : "PUBLIC",
    };
    getRoomStore(roomId).getState().setRoomSettings(next);
    void applyPatch({ nature: next.nature }, prev);
  }

  function toggleChatRights(nextOn: boolean) {
    const prev = getRoomStore(roomId).getState().roomSettings;
    if (!prev) return;
    const next: RoomSettingsDetail = {
      ...prev,
      chatRights: nextOn ? "LIMITED" : "ALL",
    };
    getRoomStore(roomId).getState().setRoomSettings(next);
    void applyPatch({ chatRights: next.chatRights }, prev);
  }

  function toggleVideoAudioRights(nextOn: boolean) {
    const prev = getRoomStore(roomId).getState().roomSettings;
    if (!prev) return;
    const next: RoomSettingsDetail = {
      ...prev,
      videoAudioRights: nextOn ? "LIMITED" : "ALL",
    };
    getRoomStore(roomId).getState().setRoomSettings(next);
    void applyPatch({ videoAudioRights: next.videoAudioRights }, prev);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Room settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Room settings"
        className={`${HEADER_CLUSTER_CIRCLE_LAYOUT} cursor-pointer border border-border bg-card/90 text-muted shadow-sm transition hover:border-border hover:bg-card`}
      >
        <AppIcon
          icon="line-md:cog-loop"
          className="h-[18px] w-[18px] sm:h-5 sm:w-5"
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Room settings"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-card p-4 shadow-[0_10px_40px_-15px_rgba(15,23,42,0.18)] dark:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)]"
        >
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
            Room settings
          </h2>
          <div className="flex flex-col">
            <LabeledToggle
              label="Private room"
              hint="Only invited members can join"
              on={panel.nature === "PRIVATE"}
              onChange={toggleNature}
            />
            <LabeledToggle
              label="Restricted chat"
              hint="Only leaders can send messages"
              on={panel.chatRights === "LIMITED"}
              onChange={toggleChatRights}
            />
            <LabeledToggle
              label="Restricted audio/video"
              hint="Only leaders can speak / share video"
              on={panel.videoAudioRights === "LIMITED"}
              onChange={toggleVideoAudioRights}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type LabeledToggleProps = {
  label: string;
  hint: string;
  on: boolean;
  onChange: (next: boolean) => void;
};

/**
 * A row in the settings panel: label + brief hint on the left, switch
 * on the right. Switch chrome is hand-rolled — same accent gradient the
 * Create button uses, dimmed when off, focus ring for keyboard users.
 */
function LabeledToggle({ label, hint, on, onChange }: LabeledToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-snug text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40",
          on
            ? "border-blue-600 bg-linear-to-b from-sky-500 via-blue-600 to-indigo-700"
            : "border-border bg-muted/40",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
            on ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
