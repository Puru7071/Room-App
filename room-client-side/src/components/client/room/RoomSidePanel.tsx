"use client";

import { useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoomQueueEntry } from "@/lib/room-types";
import { ChatView, type ChatViewProps } from "./panels/ChatView";
import { QueueView, type QueueViewProps } from "./panels/QueueView";
import { RoomParticlesBackground } from "./panels/RoomParticlesBackground";
import { VideoCallsView } from "./panels/VideoCallsView";

/**
 * The room's right-hand side panel. Hosts three tabs:
 *
 * - **Queue** — playback queue (live; existing behaviour preserved).
 * - **Chat** — group chat (placeholder).
 * - **Calls** — group video-call cards (placeholder).
 *
 * The heading row contains the tab switcher on the left and a
 * queue-only loop control on the right (rendered only when the Queue
 * tab is active). The tab is local UI state; switching is purely
 * client-side, no URL routing.
 */

type SidePanelTab = "queue" | "chat" | "calls";

type QueueProps = Pick<
  QueueViewProps,
  "past" | "nowPlaying" | "cues" | "sessionStarted" | "phase" | "onJump"
>;

type ChatProps = Pick<
  ChatViewProps,
  | "messages"
  | "currentUserId"
  | "canSend"
  | "typers"
  | "onSend"
  | "onTypingChange"
>;

type RoomSidePanelProps = QueueProps & {
  /** Current loop state from the server. */
  loop: boolean;
  /**
   * Whether the requester can flip the loop / settings. When false the
   * loop button is rendered in a disabled state and clicks no-op.
   */
  canEdit: boolean;
  /**
   * Whether the requester is allowed to drive playback (queue jumps,
   * via the row-click in QueueView). Mirrors the page-level rule:
   * `isOwner || nature === "PUBLIC"`. When false, queue rows render
   * as non-interactive `<div>`s.
   */
  canControlPlayback: boolean;
  /** Called when the loop button is clicked (only fires when `canEdit`). */
  onLoopToggle?: () => void;
  /** True while the queue is being fetched from the server on page mount. */
  queueLoading?: boolean;
  /* ---- chat props (forwarded to ChatView) ---- */
  /** Local chat list with delivery status. */
  chatMessages: ChatProps["messages"];
  /** The viewing user's id, for own-vs-other message styling. */
  currentUserId: ChatProps["currentUserId"];
  /** Gate for the composer (LIMITED chat → owner-only). */
  canSendChat: ChatProps["canSend"];
  /** Map of currently-typing peers, keyed by userId. */
  typers: ChatProps["typers"];
  /** Submit a chat message. */
  onSendChat: ChatProps["onSend"];
  /** Composer input change → drives typing.start/stop emits. */
  onTypingChange: ChatProps["onTypingChange"];
  className?: string;
};

const TAB_DEFS: ReadonlyArray<{ id: SidePanelTab; label: string }> = [
  { id: "queue", label: "Queue" },
  { id: "chat", label: "Chat" },
  { id: "calls", label: "Calls" },
];

export function RoomSidePanel({
  past,
  nowPlaying,
  cues,
  sessionStarted,
  phase,
  onJump,
  loop,
  canEdit,
  canControlPlayback,
  onLoopToggle,
  queueLoading = false,
  chatMessages,
  currentUserId,
  canSendChat,
  typers,
  onSendChat,
  onTypingChange,
  className = "",
}: RoomSidePanelProps) {
  const [tab, setTab] = useState<SidePanelTab>("queue");

  return (
    // Outer panel is `relative` so the shared particle canvas can sit
    // behind every tab as an absolute fill. Hoisting the background
    // here (instead of inside each panel view) keeps the canvas mounted
    // across tab switches — toggling between Queue / Chat / Calls only
    // swaps the foreground content while the drift animation continues
    // uninterrupted.
    <div
      className={`relative flex h-full rounded-xl min-h-0 flex-col overflow-hidden border border-border bg-zinc-100 text-foreground shadow-sm dark:border-zinc-800 dark:bg-[#0f0f0f] dark:text-zinc-100 ${className}`}
    >
      <RoomParticlesBackground id="side-panel-particles" />
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-2.5 py-2 sm:px-3">
        <div
          role="tablist"
          aria-label="Side panel"
          className="flex items-center gap-0.5"
        >
          {TAB_DEFS.map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
        </div>
        {tab === "queue" ? (
          <LoopButton
            on={loop}
            canEdit={canEdit}
            onClick={onLoopToggle}
          />
        ) : null}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {tab === "queue" ? (
          <QueueView
            past={past}
            nowPlaying={nowPlaying}
            cues={cues}
            sessionStarted={sessionStarted}
            phase={phase}
            onJump={canControlPlayback ? onJump : undefined}
            canControlPlayback={canControlPlayback}
            loading={queueLoading}
          />
        ) : tab === "chat" ? (
          <ChatView
            messages={chatMessages}
            currentUserId={currentUserId}
            canSend={canSendChat}
            typers={typers}
            onSend={onSendChat}
            onTypingChange={onTypingChange}
          />
        ) : (
          <VideoCallsView />
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "cursor-pointer border-b-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition outline-none focus-visible:text-foreground",
        active
          ? "border-foreground text-foreground dark:border-zinc-100 dark:text-zinc-100"
          : "border-transparent text-muted hover:text-foreground dark:text-zinc-500 dark:hover:text-zinc-300",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function LoopButton({
  on,
  canEdit,
  onClick,
}: {
  on: boolean;
  canEdit: boolean;
  onClick?: () => void;
}) {
  const handleClick = canEdit && onClick ? onClick : undefined;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canEdit}
      aria-label={on ? "Disable loop" : "Enable loop"}
      aria-pressed={on}
      title={
        canEdit
          ? on
            ? "Loop is on"
            : "Loop is off"
          : on
            ? "Loop is on (creator-only)"
            : "Loop is off (creator-only)"
      }
      className={[
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40",
        canEdit ? "cursor-pointer" : "cursor-not-allowed",
        on
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-border bg-card text-muted dark:bg-zinc-900 dark:text-zinc-500",
        !canEdit ? "opacity-70" : "",
      ].join(" ")}
    >
      <AppIcon icon="lucide:repeat" className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

// Re-export the queue entry type for convenience — consumers used to
// import it from the queue panel; keeping the import path stable.
export type { RoomQueueEntry };
