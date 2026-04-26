"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";
import { HomeHeaderActions } from "@/components/client/home/HomeHeaderActions";
import type { RoomMemberRow } from "@/lib/room-types";
import type { RoomSettingsDetail } from "@/lib/api";
import type { YouTubeSearchResult } from "@/lib/youtube-api";
import { RoomMemberFacepile } from "./RoomMemberFacepile";
import { RoomPrivateToggle } from "./RoomPrivateToggle";
import { RoomSettingsControl } from "./RoomSettingsControl";
import { RoomShareButton } from "./RoomShareButton";
import { RoomYouTubeSearchInput } from "./RoomYouTubeSearchInput";
import { AppIcon } from "@/components/icons/AppIcon";
import { APP_DISPLAY_NAME } from "@/lib/app-constants";

const YOUTUBE_BAR_CHROME =
  "flex h-9 min-h-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/25 shadow-sm ring-accent-blue/30 transition hover:border-border sm:h-10";

type RoomPrivateToggleConfig = {
  isPrivate: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
};

type RoomPageHeaderProps = {
  roomId: string;
  videoUrl: string;
  onVideoUrlChange: (value: string) => void;
  onAddVideo: () => void;
  /** Called when the user picks a result from the YouTube search dropdown.
   *  Parent enqueues the chosen video. */
  onSearchPick: (result: YouTubeSearchResult) => void;
  /** When set, owner-only private/public switch (left of theme control). */
  roomPrivateToggle?: RoomPrivateToggleConfig;
  /** Live roster for the member facepile (left of private toggle). */
  roomMembers?: RoomMemberRow[];
  /** When true (requesting user equals `Room.createdBy`), shows the
   *  settings gear in the right cluster. */
  isOwner?: boolean;
  /** Current room settings (if loaded). Required for the settings
   *  popover; if null the gear is hidden even when `isOwner`. */
  settings?: RoomSettingsDetail | null;
  /** Called when the settings popover successfully (or optimistically)
   *  updates a setting. Wires the parent's `setSettings` so the panel
   *  reflects the latest server-truth. */
  onSettingsUpdated?: (next: RoomSettingsDetail) => void;
  /**
   * Whether the requesting user is allowed to add videos to the queue.
   * False for non-leaders in private rooms — disables both the URL
   * input + plus button AND the YouTube search input. The dedicated
   * "request to add" flow is a follow-up story.
   */
  canAddVideos?: boolean;
};

export function RoomPageHeader({
  roomId,
  videoUrl,
  onVideoUrlChange,
  onAddVideo,
  onSearchPick,
  roomPrivateToggle,
  roomMembers = [],
  isOwner,
  settings,
  onSettingsUpdated,
  canAddVideos = true,
}: RoomPageHeaderProps) {
  const handleAddVideo = useCallback(() => {
    if (!canAddVideos) return;
    onAddVideo();
  }, [onAddVideo, canAddVideos]);
  const lockedTooltip = canAddVideos
    ? undefined
    : "Only the host can add videos in a private room";

  return (
    <header className="relative z-40 shrink-0 bg-transparent">
      {/*
        Match RoomWatchLayout: max width, px, lg gap + queue column width so the
        YouTube + room cluster's right edge lines up with the player below.
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
            <div className="flex min-w-0 max-w-[40rem] flex-1 flex-row gap-2 sm:gap-3">
              <label htmlFor="room-youtube-input" className="sr-only">
                Paste YouTube link
              </label>
              <div className={`${YOUTUBE_BAR_CHROME} min-w-0 flex-1`}>
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
                  placeholder={canAddVideos ? "Paste YouTube link…" : "Host-only in private rooms"}
                  autoComplete="off"
                  spellCheck={false}
                  tabIndex={-1}
                  disabled={!canAddVideos}
                  title={lockedTooltip}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddVideo();
                    }
                  }}
                  className="min-w-0 flex-1 border-0 bg-input-bg/70 py-2 pl-2 pr-1.5 text-xs font-medium text-foreground outline-none ring-0 placeholder:text-muted focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5 sm:pl-2.5 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddVideo}
                  title={lockedTooltip ?? "Add video"}
                  aria-label="Add video to room"
                  tabIndex={-1}
                  disabled={!canAddVideos}
                  className="inline-flex min-w-9 shrink-0 items-center cursor-pointer justify-center border-l border-foreground/10 bg-blue-600 px-2 text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-blue-600 sm:min-w-10 sm:px-2.5"
                >
                  <AppIcon
                    icon="lucide:plus"
                    className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                    aria-hidden
                  />
                </button>
              </div>
              <RoomYouTubeSearchInput
                onPick={onSearchPick}
                sizingClass="min-w-0 flex-1"
                disabled={!canAddVideos}
                disabledTitle={lockedTooltip}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end lg:w-[min(100%,402px)]">
          <HomeHeaderActions
            showLogout
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
            afterTheme={
              <>
                <RoomShareButton roomId={roomId} />
                {isOwner && settings && onSettingsUpdated ? (
                  <RoomSettingsControl
                    roomId={roomId}
                    settings={settings}
                    onUpdated={onSettingsUpdated}
                  />
                ) : null}
              </>
            }
          />
        </div>
      </div>
    </header>
  );
}
