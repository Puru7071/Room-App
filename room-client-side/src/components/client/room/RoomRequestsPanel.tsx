"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { initialsFromDisplayName } from "@/lib/display-name-initials";
import { relativeFromIso } from "@/lib/youtube-api";
import type { JoinRequestWire } from "@/lib/ws-events";

type RoomRequestsPanelProps = {
  /** Toggles the leader-only carousel content. Non-owners see a hint. */
  isOwner: boolean;
  /** Pending requests, fed by the parent's WebSocket subscription. */
  requests: JoinRequestWire[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
};

/**
 * Bottom-right "Join requests" panel.
 *
 * Layout:
 *   ┌─ panel ─────────────────────────────────────┐
 *   │  JOIN REQUESTS                  ‹  1/3  ›   │  ← header + slider
 *   │  ┌─ request card ──────────────────────────┐│
 *   │  │ ▓▓▓▓░░░░░░░░░░░░  countdown            ││
 *   │  │ [avatar] Alice wants to join           ││
 *   │  │          12 minutes ago                ││
 *   │  │              [ Reject ]   [ Accept ]   ││
 *   │  └────────────────────────────────────────┘│
 *   └────────────────────────────────────────────-┘
 *
 * The slider in the header (chevrons + counter) cycles through
 * pending requests. The card itself is a distinct visual surface
 * (`bg-card` over the panel's `bg-zinc-100`) so it reads as a card
 * inside the panel, not a flat content block.
 *
 * Visibility:
 *   - non-owner → renders the chrome with "Visible to leader only."
 *   - owner     → renders the slider + card (or "No active requests.")
 */
export function RoomRequestsPanel({
  isOwner,
  requests,
  onApprove,
  onReject,
}: RoomRequestsPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Clamp the index when the list shrinks (request resolved/expired).
  // Don't auto-jump on new arrivals — leader keeps their place.
  useEffect(() => {
    if (requests.length === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }
    if (currentIndex >= requests.length) {
      setCurrentIndex(requests.length - 1);
    }
  }, [requests.length, currentIndex]);

  const visible = requests[currentIndex] ?? null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < requests.length - 1;

  return (
    <section
      role="region"
      aria-label="Join requests"
      className="flex h-[148px] flex-col overflow-hidden rounded-xl border border-border bg-zinc-100 text-foreground shadow-sm dark:border-zinc-800 dark:bg-[#0f0f0f] dark:text-zinc-100"
    >
      {/* Header row: title + slider on the right. */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          Join requests
        </h3>
        {isOwner && requests.length > 0 ? (
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
            <span className="min-w-10 text-center text-[11px] font-medium tabular-nums text-muted">
              {currentIndex + 1} of {requests.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((i) => Math.min(requests.length - 1, i + 1))
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
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        {!isOwner ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted">
            Visible to the room leader only.
          </div>
        ) : visible === null ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted">
            No active requests.
          </div>
        ) : (
          <RequestCard
            request={visible}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}
      </div>
    </section>
  );
}

type RequestCardProps = {
  request: JoinRequestWire;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

/**
 * Inner card surface for a single request. Distinct background from
 * the outer panel so it reads as a card-on-surface, not a flat block.
 * The countdown bar lives at the top of THIS card (per-request, not
 * per-panel).
 */
function RequestCard({ request, onApprove, onReject }: RequestCardProps) {
  // Time remaining drives the countdown's animation duration so the
  // bar's position is correct even on cards mounting late in life.
  const remainingMs = Math.max(
    0,
    new Date(request.expiresAt).getTime() - Date.now(),
  );

  return (
    <article className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Countdown bar — flush against the top of the card. */}
      <div className="absolute left-0 right-0 top-0 h-[3px] overflow-hidden bg-muted/15">
        <div
          key={request.id}
          aria-hidden
          className="room-request-countdown h-full bg-accent-blue"
          style={{ animationDuration: `${remainingMs}ms` }}
        />
      </div>

      {/* Card content */}
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

      {/* Action row */}
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
