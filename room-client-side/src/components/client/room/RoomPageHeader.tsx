"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HomeHeaderActions } from "@/components/client/home/HomeHeaderActions";
import type { RoomMemberRow } from "@/lib/room-types";
import { RoomMemberFacepile } from "./RoomMemberFacepile";
import { RoomPrivateToggle } from "./RoomPrivateToggle";
import { AppIcon } from "@/components/icons/AppIcon";
import { APP_DISPLAY_NAME } from "@/lib/app-constants";

/** Same footprint for the YouTube bar and the room card (center cluster). */
const CENTER_CONTROL_WIDTH =
  "w-60 max-w-[min(15rem,calc(100vw-9rem))] shrink-0 sm:w-72 sm:max-w-[min(18rem,calc(100vw-10rem))] md:w-80 md:max-w-[min(20rem,calc(100vw-12rem))]";

const YOUTUBE_BAR_CHROME =
  "flex h-9 min-h-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/25 shadow-sm ring-accent-blue/30 transition hover:border-border sm:h-10";

/** Room card: lifted neutral panel (reads apart from the flat YouTube bar). */
const ROOM_CARD_CHROME =
  "flex h-9 min-h-0 items-stretch overflow-hidden rounded-lg border border-border bg-gradient-to-b from-card to-muted/15 shadow-md shadow-black/[0.06] ring-1 ring-black/[0.04] transition hover:border-border hover:shadow-lg hover:shadow-black/[0.08] dark:from-zinc-900 dark:to-zinc-950 dark:shadow-black/40 dark:ring-white/[0.05] dark:hover:border-zinc-600 dark:hover:ring-white/[0.08] sm:h-10";

type RoomPrivateToggleConfig = {
  isPrivate: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
};

type RoomPageHeaderProps = {
  roomId: string;
  roomName?: string | null;
  videoUrl: string;
  onVideoUrlChange: (value: string) => void;
  onAddVideo: () => void;
  /** When set, owner-only private/public switch (left of theme control). */
  roomPrivateToggle?: RoomPrivateToggleConfig;
  /** Live roster for the member facepile (left of private toggle). */
  roomMembers?: RoomMemberRow[];
};

export function RoomPageHeader({
  roomId,
  roomName,
  videoUrl,
  onVideoUrlChange,
  onAddVideo,
  roomPrivateToggle,
  roomMembers = [],
}: RoomPageHeaderProps) {
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [copyFailedFlash, setCopyFailedFlash] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const displayRoomName = roomName?.trim() || "Untitled room";

  const copyRoomId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopyFailedFlash(false);
      setCopiedFlash(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedFlash(false);
        copyTimerRef.current = null;
      }, 1400);
    } catch {
      setCopiedFlash(false);
      setCopyFailedFlash(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopyFailedFlash(false);
        copyTimerRef.current = null;
      }, 2000);
    }
  }, [roomId]);

  const handleAddVideo = useCallback(() => {
    onAddVideo();
  }, [onAddVideo]);

  return (
    <header className="relative z-40 shrink-0 bg-transparent">
      {/*
        Match RoomWatchLayout: max width, px, lg gap + queue column width so the
        YouTube + room cluster’s right edge lines up with the player below.
      */}
      <div className="mx-auto flex h-14 w-full max-w-[1600px] flex-col gap-3 px-4 py-2 sm:h-16 sm:gap-3 sm:px-8 lg:h-16 lg:flex-row lg:items-center lg:gap-x-6 lg:py-0">
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="flex shrink-0 items-center">
            <Link
              href="/"
              tabIndex={-1}
              className="flex shrink-0 items-center gap-3 rounded-lg outline-none ring-accent-blue/40 focus-visible:ring-2 sm:gap-4"
            >
              <div className="rounded-sm bg-white p-0.5 py-0">
                <Image
                  src="/logo-mark.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-8 w-8 object-contain"
                  unoptimized
                  aria-hidden={true}
                />
              </div>
              <span className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {APP_DISPLAY_NAME}
              </span>
            </Link>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-row flex-nowrap items-center justify-center gap-2 sm:gap-3 lg:justify-end">
            <label htmlFor="room-youtube-input" className="sr-only">
              Paste YouTube link
            </label>
            <div className={`${YOUTUBE_BAR_CHROME} ${CENTER_CONTROL_WIDTH}`}>
              <span
                className="inline-flex min-w-8 shrink-0 items-center justify-center self-stretch bg-slate-200 px-2 text-black dark:bg-zinc-600 dark:text-zinc-100 sm:min-w-9 sm:px-2.5"
                title="YouTube"
              >
                <AppIcon
                  icon="ri:youtube-fill"
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  aria-hidden
                />
              </span>
              <input
                id="room-youtube-input"
                type="url"
                inputMode="url"
                name="youtubeUrl"
                value={videoUrl}
                onChange={(e) => onVideoUrlChange(e.target.value)}
                placeholder="Paste YouTube link…"
                autoComplete="off"
                spellCheck={false}
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddVideo();
                  }
                }}
                className="min-w-0 flex-1 border-0 bg-input-bg/70 py-2 pl-2 pr-1.5 text-xs font-medium text-foreground outline-none ring-0 placeholder:text-muted focus:ring-0 sm:py-2.5 sm:pl-2.5 sm:text-sm"
              />
              <button
                type="button"
                onClick={handleAddVideo}
                title="Add video"
                aria-label="Add video to room"
                tabIndex={-1}
                className="inline-flex min-w-9 shrink-0 items-center cursor-pointer justify-center border-l border-foreground/10 bg-blue-600 px-2 text-white transition hover:bg-blue-700 active:bg-blue-800 sm:min-w-10 sm:px-2.5"
              >
                <AppIcon
                  icon="lucide:plus"
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  aria-hidden
                />
              </button>
            </div>

            <div className={`${ROOM_CARD_CHROME} ${CENTER_CONTROL_WIDTH}`}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1 px-2.5 py-1 sm:px-3">
                <p className="truncate text-xs font-semibold leading-tight tracking-tight text-foreground sm:text-sm">
                  {displayRoomName}
                </p>
                <div className="min-h-0 min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
                  <p className="whitespace-nowrap font-mono text-[11px] leading-snug tracking-tight text-foreground/80 sm:text-xs dark:text-zinc-200">
                    <span className="sr-only">Room ID: </span>
                    {roomId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void copyRoomId()}
                className="inline-flex w-9 shrink-0 flex-col items-center cursor-pointer justify-center gap-0.5 self-stretch border-l border-border bg-muted/35 px-0.5 text-muted transition hover:bg-muted/55 hover:text-foreground dark:bg-muted/20 dark:hover:bg-muted/35 sm:w-10"
                aria-label="Copy room ID"
              >
                {copyFailedFlash ? (
                  <>
                    <AppIcon
                      icon="lucide:copy"
                      className="h-3 w-3 shrink-0 opacity-70 sm:h-3.5 sm:w-3.5 cursor-pointer"
                      aria-hidden
                    />
                    <span className="max-w-full text-center text-[7px] font-semibold leading-none text-red-600 dark:text-red-400">
                      Failed
                    </span>
                  </>
                ) : copiedFlash ? (
                  <>
                    <AppIcon
                      icon="lucide:check"
                      className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400 sm:h-3.5 sm:w-3.5"
                      aria-hidden
                    />
                    <span className="max-w-full text-center text-[7px] font-semibold leading-none text-emerald-700 dark:text-emerald-300">
                      Copied
                    </span>
                  </>
                ) : (
                  <AppIcon
                    icon="lucide:copy"
                    className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
                    aria-hidden
                  />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end lg:w-[min(100%,402px)]">
          <HomeHeaderActions
            beforePrivateToggle={<RoomMemberFacepile members={roomMembers} />}
            beforeTheme={
              roomPrivateToggle ? (
                <RoomPrivateToggle
                  checked={roomPrivateToggle.isPrivate}
                  disabled={roomPrivateToggle.disabled}
                  onCheckedChange={roomPrivateToggle.onChange}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    </header>
  );
}
