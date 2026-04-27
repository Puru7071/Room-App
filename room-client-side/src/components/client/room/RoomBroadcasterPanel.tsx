"use client";

import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { initialsFromDisplayName } from "@/lib/display-name-initials";
import { useYouTubeOEmbedTitle } from "@/lib/use-youtube-oembed-title";
import type {
  JoinRequestWire,
  VideoAddRequestWire,
} from "@/lib/ws-events";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import { relativeFromIso } from "@/lib/youtube-api";

type RoomBroadcasterPanelProps = {
  /** Toggles the leader-only carousel content. Non-owners see the empty
   *  state placeholder regardless of pending requests. */
  isOwner: boolean;
  /** Pending join-room requests, fed by the parent's WS subscription. */
  joinRequests: JoinRequestWire[];
  /** Pending video-add requests (raised by non-leaders in LIMITED rooms). */
  addRequests: VideoAddRequestWire[];
  onApproveJoin: (requestId: string) => void;
  onRejectJoin: (requestId: string) => void;
  onApproveAdd: (requestId: string) => void;
  onRejectAdd: (requestId: string) => void;
};

/**
 * Bottom-right "Room Broadcaster" panel — the renamed + extended
 * successor to the old `RoomRequestsPanel`. Hosts a single-card
 * carousel of mixed broadcast items:
 *
 *   - **Join-room requests** (`kind: "join"`): leader sees, approves
 *     or rejects via existing `room.request.approve/reject` events.
 *   - **Video-add requests** (`kind: "add"`): raised by non-leaders
 *     in LIMITED edit-access rooms when they paste / search a video.
 *     Leader approves to insert into queue; rejects to discard.
 *
 * Layout:
 *   ┌─ panel (room-corner-ripple-flip dot pattern bg) ──┐
 *   │  ROOM BROADCASTER · 1 of 2     ‹  ›              │
 *   │  ┌─ card (join OR video-add) ──────────────────┐ │
 *   │  │ ▓▓▓▓░░░░░░░░░░░ countdown                   │ │
 *   │  │ [type-specific content + reject/accept]     │ │
 *   │  └─────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────┘
 *
 * When idle, an empty-state placeholder (radio-tower icon + tagline)
 * keeps the panel from reading as dead space.
 */

type BroadcastItem =
  | { kind: "join"; req: JoinRequestWire }
  | { kind: "add"; req: VideoAddRequestWire };

export function RoomBroadcasterPanel({
  isOwner,
  joinRequests,
  addRequests,
  onApproveJoin,
  onRejectJoin,
  onApproveAdd,
  onRejectAdd,
}: RoomBroadcasterPanelProps) {
  // Merge the two lists into a single carousel feed. Joins come first,
  // then video-adds — order is stable so the leader's "current index"
  // doesn't jump as new items of the opposite type arrive.
  const items = useMemo<BroadcastItem[]>(
    () => [
      ...joinRequests.map((r) => ({ kind: "join" as const, req: r })),
      ...addRequests.map((r) => ({ kind: "add" as const, req: r })),
    ],
    [joinRequests, addRequests],
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  // Clamp the index when the merged list shrinks (request resolved /
  // expired / rejected). Don't auto-jump on new arrivals.
  useEffect(() => {
    if (items.length === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }
    if (currentIndex >= items.length) {
      setCurrentIndex(items.length - 1);
    }
  }, [items.length, currentIndex]);

  const visible = isOwner ? items[currentIndex] ?? null : null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < items.length - 1;
  const showSlider = isOwner && items.length > 0;

  return (
    <section
      role="region"
      aria-label="Room Broadcaster"
      className="relative flex h-[148px] flex-col overflow-hidden rounded-xl border border-border bg-zinc-100 text-foreground shadow-sm dark:border-zinc-800 dark:bg-[#0f0f0f] dark:text-zinc-100"
    >
      {/* Mirrored dot pattern — densest at top-left, fades to bottom-right.
          Mirrors RoomNowPlayingCard's `.room-corner-ripple` (dense at the
          opposite corner) so when stacked the two patterns visually echo. */}
      <div
        className="room-corner-ripple-flip pointer-events-none absolute inset-0 opacity-50 dark:opacity-45"
        aria-hidden
      />

      {/* Header row */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Room Broadcaster
          </h3>
          {showSlider ? (
            <span className="text-[11px] font-medium tabular-nums text-muted/80">
              · {currentIndex + 1} of {items.length}
            </span>
          ) : null}
        </div>
        {showSlider ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={!canPrev}
              aria-label="Previous request"
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-muted/20 hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <AppIcon icon="lucide:chevron-left" className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((i) => Math.min(items.length - 1, i + 1))
              }
              disabled={!canNext}
              aria-label="Next request"
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-muted/20 hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <AppIcon icon="lucide:chevron-right" className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </header>

      {/* Body */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-3">
        {visible === null ? (
          <EmptyState isOwner={isOwner} />
        ) : visible.kind === "join" ? (
          <JoinRequestCard
            request={visible.req}
            onApprove={onApproveJoin}
            onReject={onRejectJoin}
          />
        ) : (
          <VideoAddRequestCard
            request={visible.req}
            onApprove={onApproveAdd}
            onReject={onRejectAdd}
          />
        )}
      </div>
    </section>
  );
}

function EmptyState({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-2 text-center">
      <AppIcon
        icon="lucide:radio-tower"
        className="h-5 w-5 text-muted/70"
        aria-hidden
      />
      <p className="text-xs font-medium tracking-wide text-foreground/80">
        Quiet on the wire
      </p>
      <p className="text-[11px] leading-snug text-muted">
        {isOwner
          ? "Join + video-add requests will land here"
          : "Activites in the room will appear here"}
      </p>
    </div>
  );
}

function CountdownBar({ requestId, expiresAtIso }: { requestId: string; expiresAtIso: string }) {
  const remainingMs = Math.max(0, new Date(expiresAtIso).getTime() - Date.now());
  return (
    <div className="absolute left-0 right-0 top-0 h-[3px] overflow-hidden bg-muted/15">
      <div
        key={requestId}
        aria-hidden
        className="room-request-countdown h-full bg-accent-blue"
        style={{ animationDuration: `${remainingMs}ms` }}
      />
    </div>
  );
}

function JoinRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: JoinRequestWire;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <article className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <CountdownBar requestId={request.id} expiresAtIso={request.expiresAt} />

      <div className="flex min-h-0 flex-1 items-center gap-3 px-3 pt-3">
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 text-xs font-semibold tracking-tight text-zinc-700 shadow-sm select-none dark:from-zinc-700 dark:to-zinc-600 dark:text-zinc-100"
        >
          {initialsFromDisplayName(request.userName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {request.userName} wants to join
          </p>
          <p className="text-xs text-muted">
            {relativeFromIso(request.createdAt)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 px-3 pb-2.5">
        <button
          type="button"
          onClick={() => onReject(request.id)}
          className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-transparent px-2.5 text-xs font-medium text-muted transition hover:bg-muted/10 hover:text-foreground"
          aria-label={`Reject request from ${request.userName}`}
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => onApprove(request.id)}
          className="inline-flex h-7 cursor-pointer items-center rounded-md bg-accent-blue px-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
          aria-label={`Accept request from ${request.userName}`}
        >
          Accept
        </button>
      </div>
    </article>
  );
}

function VideoAddRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: VideoAddRequestWire;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const title = useYouTubeOEmbedTitle(request.videoId);

  return (
    <article className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <CountdownBar requestId={request.id} expiresAtIso={request.expiresAt} />

      {/* Top: thumbnail + title only. The "suggested by" text moved
          into the action row as a badge so the title gets the full
          horizontal width of the right column without crowding. */}
      <div className="flex min-h-0 flex-1 items-start gap-3 px-3 pt-3">
        <div className="relative h-10 w-18 shrink-0 overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={youtubeThumbnailUrl(request.videoId, "mqdefault")}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="min-w-0 flex-1">
          {title === null ? (
            <span className="flex flex-col gap-1.5 py-0.5" aria-hidden>
              <span className="block h-3 w-11/12 animate-pulse rounded bg-muted/40 dark:bg-zinc-800/60" />
              <span className="block h-3 w-7/12 animate-pulse rounded bg-muted/40 dark:bg-zinc-800/60" />
            </span>
          ) : (
            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
              {title}
            </p>
          )}
        </div>
      </div>

      {/* Action row: [requester badge] left · [Reject][Accept] right.
          The badge replaces the cramped "Suggested by …" sub-line,
          freeing the content area above for a cleaner 2-line title. */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 pb-2.5" style={{zoom:0.8}}>
        <RequesterBadge
          userName={request.userName}
          createdAtIso={request.createdAt}
        />
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onReject(request.id)}
            className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-transparent px-2.5 text-xs font-medium text-muted transition hover:bg-muted/10 hover:text-foreground"
            aria-label={`Reject ${request.userName}'s video`}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(request.id)}
            className="inline-flex h-7 cursor-pointer items-center rounded-md bg-accent-blue px-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
            aria-label={`Accept ${request.userName}'s video`}
          >
            Accept
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Compact pill identifying who raised the request — avatar (initials)
 * + name + relative time. Lives in the action row, on the left,
 * sitting in front of the Reject/Accept buttons. Truncates if the
 * username is long so it never pushes the buttons off-screen.
 */
function RequesterBadge({
  userName,
  createdAtIso,
}: {
  userName: string;
  createdAtIso: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 truncate rounded-full bg-muted/15 py-1 pl-1 pr-2.5 dark:bg-zinc-800/60">
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 text-[9px] font-semibold text-zinc-700 select-none dark:from-zinc-700 dark:to-zinc-600 dark:text-zinc-100"
      >
        {initialsFromDisplayName(userName)}
      </span>
      <span className="min-w-0 truncate text-[11px] font-medium text-foreground/80">
        {userName}
      </span>
      <span className="shrink-0 text-[11px] text-muted">
        · {relativeFromIso(createdAtIso)}
      </span>
    </div>
  );
}
