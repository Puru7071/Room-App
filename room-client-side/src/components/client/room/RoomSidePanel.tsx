"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoomQueueEntry } from "@/lib/room-types";
import {
  useRoomStore,
  useRoomUiPrefsStore,
} from "@/components/client/room/store/roomStore";
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
  | "roomId"
  | "currentUserId"
  | "canSend"
  | "onSend"
  | "onTypingChange"
>;

type RoomSidePanelProps = QueueProps & {
  roomId: string;
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
  /** The viewing user's id, for own-vs-other message styling. */
  currentUserId: ChatProps["currentUserId"];
  /** Gate for the composer (LIMITED chat → owner-only). */
  canSendChat: ChatProps["canSend"];
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
  roomId,
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
  currentUserId,
  canSendChat,
  onSendChat,
  onTypingChange,
  className = "",
}: RoomSidePanelProps) {
  const [tab, setTab] = useState<SidePanelTab>("queue");
  const chatUnreadCount = useRoomStore(roomId, (s) => s.chatUnreadCount);
  const chatReceiveSoundEnabled = useRoomUiPrefsStore(
    (s) => s.chatReceiveSoundEnabled,
  );
  const setChatReceiveSoundEnabled = useRoomUiPrefsStore(
    (s) => s.setChatReceiveSoundEnabled,
  );

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
      <IncomingMessageSoundListener
        roomId={roomId}
        currentUserId={currentUserId}
        enabled={chatReceiveSoundEnabled}
      />
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
              unreadBadge={t.id === "chat" && tab !== "chat" ? chatUnreadCount : 0}
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
        ) : tab === "chat" ? (
          <SoundToggleButton
            enabled={chatReceiveSoundEnabled}
            onClick={() => setChatReceiveSoundEnabled(!chatReceiveSoundEnabled)}
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
          <ChatMessagesPane
            roomId={roomId}
            currentUserId={currentUserId}
            canSend={canSendChat}
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

const ChatMessagesPane = memo(function ChatMessagesPane({
  roomId,
  currentUserId,
  canSend,
  onSend,
  onTypingChange,
}: {
  roomId: string;
  currentUserId: string | null;
  canSend: boolean;
  onSend: (body: string) => void;
  onTypingChange: (value: string) => void;
}) {
  const messages = useRoomStore(roomId, (s) => s.chatMessages);
  const unreadCount = useRoomStore(roomId, (s) => s.chatUnreadCount);
  const firstUnreadIndex = useRoomStore(roomId, (s) => s.chatFirstUnreadIndex);
  const markChatReadToLatest = useRoomStore(roomId, (s) => s.markChatReadToLatest);
  return (
    <ChatView
      roomId={roomId}
      messages={messages}
      unreadCount={unreadCount}
      firstUnreadIndex={firstUnreadIndex}
      currentUserId={currentUserId}
      canSend={canSend}
      onSend={onSend}
      onTypingChange={onTypingChange}
      onMarkRead={markChatReadToLatest}
    />
  );
});

function IncomingMessageSoundListener({
  roomId,
  currentUserId,
  enabled,
}: {
  roomId: string;
  currentUserId: string | null;
  enabled: boolean;
}) {
  const messageCount = useRoomStore(roomId, (s) => s.chatMessages.length);
  const newestMessageId = useRoomStore(roomId, (s) => {
    const latest = s.chatMessages[s.chatMessages.length - 1];
    return latest?.id ?? null;
  });
  const newestSenderId = useRoomStore(roomId, (s) => {
    const latest = s.chatMessages[s.chatMessages.length - 1];
    return latest?.senderId ?? null;
  });
  const receivedSoundRef = useRef<HTMLAudioElement | null>(null);
  const hasHydratedIncomingRef = useRef(false);
  const prevIncomingLengthRef = useRef(messageCount);
  const lastPlayedIncomingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (messageCount === 0 || !newestMessageId) return;
    if (!hasHydratedIncomingRef.current) {
      hasHydratedIncomingRef.current = true;
      prevIncomingLengthRef.current = messageCount;
      lastPlayedIncomingIdRef.current = newestMessageId;
      return;
    }
    if (messageCount <= prevIncomingLengthRef.current) {
      prevIncomingLengthRef.current = messageCount;
      return;
    }
    prevIncomingLengthRef.current = messageCount;
    if (!enabled) return;
    if (newestSenderId === currentUserId) return;
    if (lastPlayedIncomingIdRef.current === newestMessageId) return;
    lastPlayedIncomingIdRef.current = newestMessageId;
    let audio = receivedSoundRef.current;
    if (!audio) {
      audio = new Audio("/audios/message-recieved.mp3");
      audio.preload = "auto";
      receivedSoundRef.current = audio;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, [messageCount, newestMessageId, newestSenderId, enabled, currentUserId]);

  return null;
}

function SoundToggleButton({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={enabled ? "Disable message sound" : "Enable message sound"}
      aria-pressed={enabled}
      title={enabled ? "Message sound on" : "Message sound off"}
      className={[
        "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40",
        enabled
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-border bg-card text-muted dark:bg-zinc-900 dark:text-zinc-500",
      ].join(" ")}
    >
      <AppIcon
        icon={enabled ? "lucide:bell" : "lucide:bell-off"}
        className="h-3.5 w-3.5"
        aria-hidden
      />
    </button>
  );
}

function TabButton({
  label,
  active,
  unreadBadge,
  onClick,
}: {
  label: string;
  active: boolean;
  unreadBadge?: number;
  onClick: () => void;
}) {
  const badgeLabel =
    unreadBadge && unreadBadge > 0 ? (unreadBadge > 9 ? "9+" : String(unreadBadge)) : null;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "cursor-pointer border-b-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition outline-none focus-visible:text-foreground",
        "inline-flex items-center gap-1",
        active
          ? "border-foreground text-foreground dark:border-zinc-100 dark:text-zinc-100"
          : "border-transparent text-muted hover:text-foreground dark:text-zinc-500 dark:hover:text-zinc-300",
      ].join(" ")}
    >
      {label}
      {badgeLabel ? (
        <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent-blue px-1.5 text-[10px] leading-4 font-bold text-white">
          {badgeLabel}
        </span>
      ) : null}
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
