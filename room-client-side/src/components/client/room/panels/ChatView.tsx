"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import { Theme, type EmojiClickData } from "emoji-picker-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { AppIcon } from "@/components/icons/AppIcon";
import { initialsFromDisplayName } from "@/lib/display-name-initials";
import type { ChatMessageWire } from "@/lib/ws-events";

// Lazy-loaded so the ~150 KB picker bundle only ships when the user
// actually opens the emoji panel. SSR off — emoji-picker-react reads
// `window` during init.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

/**
 * Group chat tab. Built on `react-virtuoso`:
 *   - real DOM virtualization (only the visible rows mount)
 *   - cosmetic skeleton flash on `startReached` to make scroll-up
 *     feel intentional (data is local; no network)
 *   - `followOutput="auto"` — auto-scroll to the latest only when the
 *     user is already at the bottom; otherwise show the "↓ new
 *     messages" pill
 *
 * The hoisted particle backdrop (mounted in `RoomSidePanel`) drifts
 * unchanged behind everything here.
 */

/**
 * Local chat-message shape — wraps `ChatMessageWire` with delivery
 * state for the sender's own optimistic insert.
 *
 * - `pending`   — sent locally, waiting on the server's emit-with-ack
 *                  callback. Renders a single tick.
 * - `delivered` — server confirmed broadcast. Renders a double tick
 *                  on the sender's own messages.
 *
 * Page.tsx owns the state machine. `clientNonce` is present only
 * while pending so the page can match the ack to the right row.
 */
export type LocalChatMessage = ChatMessageWire & {
  status: "pending" | "delivered";
  clientNonce?: string;
};

export type ChatViewProps = {
  messages: LocalChatMessage[];
  currentUserId: string | null;
  canSend: boolean;
  /** Map of typers, keyed by userId. */
  typers: Record<string, { name: string }>;
  onSend: (body: string) => void;
  /** Composer input change → drives typing.start/stop emits. */
  onTypingChange: (value: string) => void;
};

/** Initial windowed slice handed to Virtuoso. */
const INITIAL_RENDER_COUNT = 50;
/** How many older messages to reveal per scroll-up "load". */
const RENDER_CHUNK = 30;
/** Cosmetic skeleton-flash duration (ms) before the next chunk reveals. */
const SKELETON_MS = 300;

/**
 * Short locale-aware time, e.g. "12:34 PM" (en-US) or "12:34" (24-h
 * locales). Cached lazily — `Intl.DateTimeFormat` construction is
 * surprisingly expensive on hot paths and ChatRow re-renders for
 * every message on every state change.
 */
let timeFormatter: Intl.DateTimeFormat | null = null;
function formatTime(ms: number): string {
  if (!timeFormatter) {
    timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return timeFormatter.format(ms);
}

export function ChatView({
  messages,
  currentUserId,
  canSend,
  typers,
  onSend,
  onTypingChange,
}: ChatViewProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT);
  const [skeletonActive, setSkeletonActive] = useState(false);
  const [hasUnreadPill, setHasUnreadPill] = useState(false);
  const [draft, setDraft] = useState("");
  const isAtBottomRef = useRef(true);
  /**
   * Briefly true on mount so the panel shows skeleton rows instead of
   * the empty pre-measurement flash that Virtuoso produces during its
   * height-measurement phase. ChatView remounts on every Chat-tab
   * activation (RoomSidePanel conditionally renders the active tab),
   * so this fires every time the user lands on Chat.
   */
  const [bootSkeleton, setBootSkeleton] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setBootSkeleton(false), 220);
    return () => window.clearTimeout(t);
  }, []);

  /** Composer input — needed for cursor-aware emoji insertion. */
  const inputRef = useRef<HTMLInputElement>(null);
  /** Whether the emoji panel is open. Anchored to the trigger button. */
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** Wraps the emoji-picker popover so click-outside can close it. */
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  /**
   * Match the picker's theme to the app's. Read once on mount; if the
   * user toggles the app theme while the panel is open, the picker
   * stays in its old theme until next open. Acceptable trade-off for
   * a v1.
   */
  const [pickerTheme] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? Theme.DARK
      : Theme.LIGHT,
  );

  // "Whoosh" sent-message sfx. Lazy-loaded on first send so the
  // initial render isn't blocked. The Audio object is reused for
  // every send (cheaper than constructing one each time, and
  // automatically rewinds via `currentTime = 0`).
  const sentSoundRef = useRef<HTMLAudioElement | null>(null);
  const playSentSound = useCallback(() => {
    let audio = sentSoundRef.current;
    if (!audio) {
      audio = new Audio("/audios/message-sent.mp3");
      audio.preload = "auto";
      sentSoundRef.current = audio;
    }
    audio.currentTime = 0;
    // play() returns a promise that rejects in the rare case the
    // browser blocks autoplay (e.g., the user hasn't interacted with
    // the page yet). Silently swallow — the user's send action is
    // itself a gesture so this should always succeed in practice.
    void audio.play().catch(() => {});
  }, []);

  // Slice the windowed view. `slice(-renderedCount)` keeps the LATEST
  // `renderedCount` messages; scroll-up expands this number.
  const view = useMemo(
    () => messages.slice(-renderedCount),
    [messages, renderedCount],
  );

  // When new messages arrive AND the user is scrolled up, surface the
  // pill. (Virtuoso's `followOutput="auto"` already handles the at-
  // bottom case — it scrolls down for us.)
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !isAtBottomRef.current) {
      setHasUnreadPill(true);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleScrolledToTop = useCallback(() => {
    if (renderedCount >= messages.length) return;
    if (skeletonActive) return;
    setSkeletonActive(true);
    window.setTimeout(() => {
      setRenderedCount((c) => Math.min(c + RENDER_CHUNK, messages.length));
      setSkeletonActive(false);
    }, SKELETON_MS);
  }, [renderedCount, messages.length, skeletonActive]);

  const handlePillClick = useCallback(() => {
    if (view.length === 0) return;
    virtuosoRef.current?.scrollToIndex({
      index: view.length - 1,
      align: "end",
      behavior: "auto",
    });
    setHasUnreadPill(false);
  }, [view.length]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!canSend || trimmed.length === 0) return;
      onSend(trimmed);
      playSentSound();
      setDraft("");
      // Clearing the input naturally fires `onTypingChange("")`
      // (via the controlled input) which emits `typing.stop`.
      onTypingChange("");
    },
    [draft, canSend, onSend, onTypingChange, playSentSound],
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      onTypingChange(value);
    },
    [onTypingChange],
  );

  /**
   * Insert an emoji at the input's caret position (or append if the
   * input has never been focused). Counts as a typing event so the
   * typing indicator fires the same way real keystrokes do. Keeps
   * the picker open so users can chain selections.
   */
  const handleEmojiPick = useCallback(
    (data: EmojiClickData) => {
      const emoji = data.emoji;
      const input = inputRef.current;
      if (!input) {
        handleDraftChange(draft + emoji);
        return;
      }
      const start = input.selectionStart ?? draft.length;
      const end = input.selectionEnd ?? draft.length;
      const next = draft.slice(0, start) + emoji + draft.slice(end);
      handleDraftChange(next);
      // Restore focus + caret right after the inserted emoji on the
      // next frame so the controlled input has time to commit `value`.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const cursor = start + emoji.length;
        el.setSelectionRange(cursor, cursor);
      });
    },
    [draft, handleDraftChange],
  );

  // Close the emoji panel on click-outside. Trigger toggle button is
  // also excluded so its onClick can flip the open state without an
  // immediate re-close.
  useEffect(() => {
    if (!emojiOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiPanelRef.current?.contains(target)) return;
      if (emojiTriggerRef.current?.contains(target)) return;
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [emojiOpen]);

  const typerList = Object.entries(typers); // [[userId, { name }], …]

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Scrollable message list — Virtuoso handles virtualization.
          A brief boot-time skeleton fills the panel for the first
          ~200 ms so tab-switch lands on something rather than a
          flash of blank measurement state. */}
      <div className="relative min-h-0 flex-1">
        {bootSkeleton ? (
          <ChatBootSkeleton />
        ) : view.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <AppIcon
              icon="lucide:message-square"
              className="h-6 w-6 text-muted dark:text-zinc-500"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-muted sm:text-sm dark:text-zinc-500">
              No messages yet. Say hi!
            </p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={view}
            followOutput="auto"
            atBottomStateChange={(atBottom) => {
              isAtBottomRef.current = atBottom;
              if (atBottom) setHasUnreadPill(false);
            }}
            startReached={handleScrolledToTop}
            initialTopMostItemIndex={Math.max(0, view.length - 1)}
            components={{
              Header: () =>
                skeletonActive ? <ChatRowSkeletons count={4} /> : null,
            }}
            itemContent={(_index, msg) => (
              <ChatRow
                msg={msg}
                isOwn={msg.senderId === currentUserId}
              />
            )}
          />
        )}

        {/* "↓ new messages" pill — centered, floats just above the
            composer. Only renders when the user is scrolled up AND a
            new message has arrived. */}
        {hasUnreadPill ? (
          <button
            type="button"
            onClick={handlePillClick}
            className="absolute bottom-2 left-1/2 z-20 inline-flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground shadow-md outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <AppIcon icon="lucide:arrow-down" className="h-3 w-3" aria-hidden />
            New messages
          </button>
        ) : null}
      </div>

      {/* Typing indicator — facepile of typers, sits just above the
          composer. Reuses the visual vocabulary of RoomMemberFacepile
          (gradient + initials + -ml-2 overlap + amber +N overflow). */}
      {typerList.length > 0 ? (
        <div className="relative z-10 flex shrink-0 items-center gap-2 px-2.5 pb-1 sm:px-3">
          <span className="flex items-center pl-0.5">
            {typerList.slice(0, 3).map(([userId, t], i) => (
              <span
                key={userId}
                className={[
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-background bg-linear-to-b from-zinc-200 to-zinc-300 text-[9px] font-semibold text-zinc-800 shadow-sm dark:from-zinc-600 dark:to-zinc-700 dark:text-zinc-100",
                  i > 0 ? "-ml-2" : "",
                ].join(" ")}
                aria-hidden
              >
                {initialsFromDisplayName(t.name)}
              </span>
            ))}
            {typerList.length > 3 ? (
              <span
                className="-ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-background bg-amber-200 text-[9px] font-bold text-zinc-900 shadow-sm dark:bg-amber-300/90 dark:text-zinc-950"
                aria-hidden
              >
                +{typerList.length - 3}
              </span>
            ) : null}
          </span>
          <TypingDots />
        </div>
      ) : null}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 shrink-0 p-2"
      >
        <div
          className={[
            "flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60",
            !canSend ? "opacity-70" : "",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={canSend ? "Send a message…" : "Only the host can chat"}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            disabled={!canSend}
            maxLength={2000}
            className={[
              "min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted dark:text-zinc-100",
              !canSend ? "cursor-not-allowed" : "",
            ].join(" ")}
          />
          <button
            ref={emojiTriggerRef}
            type="button"
            aria-label={emojiOpen ? "Close emoji picker" : "Open emoji picker"}
            aria-expanded={emojiOpen}
            disabled={!canSend}
            onClick={() => setEmojiOpen((o) => !o)}
            // Slightly dimmer base color than the send button
            // (`text-muted/70 dark:text-zinc-500` vs send's
            // `text-muted dark:text-zinc-400`) to compensate for the
            // line-md emoji's heavier visual mass — perceived
            // brightness then matches the send icon. Hover lifts both
            // buttons to the same bright tone.
            className={[
              "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted/70 transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-500",
              canSend
                ? "cursor-pointer hover:text-foreground dark:hover:text-zinc-100"
                : "",
            ].join(" ")}
          >
            <AppIcon
              icon="line-md:emoji-smile"
              className="h-4 w-4"
              aria-hidden
            />
          </button>
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend || draft.trim().length === 0}
            className={[
              "inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted transition outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400",
              canSend && draft.trim().length > 0
                ? "cursor-pointer hover:text-foreground dark:hover:text-zinc-100"
                : "",
            ].join(" ")}
          >
            <AppIcon icon="lucide:send" className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Emoji panel — absolute over the composer so opening it
            doesn't push the layout. `scale(0.8)` shrinks it visually
            without changing the picker's internal layout; the
            transform-origin keeps the bottom-right of the picker
            anchored to the trigger button as it scales. */}
        {emojiOpen ? (
          <div
            ref={emojiPanelRef}
            className="absolute right-2 bottom-full z-30 mb-1"
            style={{
              transform: "scale(0.8)",
              transformOrigin: "bottom right",
            }}
          >
            <EmojiPicker
              onEmojiClick={handleEmojiPick}
              theme={pickerTheme}
              width={300}
              height={360}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              skinTonesDisabled
            />
          </div>
        ) : null}
      </form>
    </div>
  );
}

/** A single chat row. Own messages right-align with a blue bubble +
 *  delivery ticks (and NO avatar — the viewer knows who they are).
 *  Others' messages left-align with a neutral bubble, the sender's
 *  initials avatar, and a sender-name eyebrow. */
function ChatRow({ msg, isOwn }: { msg: LocalChatMessage; isOwn: boolean }) {
  return (
    <div
      className={[
        "flex w-full items-end gap-1.5 px-2.5 py-1 sm:px-3",
        isOwn ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!isOwn ? (
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-linear-to-b from-zinc-200 to-zinc-300 text-[10px] font-semibold text-zinc-800 shadow-sm dark:from-zinc-600 dark:to-zinc-700 dark:text-zinc-100"
          aria-hidden
        >
          {initialsFromDisplayName(msg.senderName)}
        </span>
      ) : null}
      <div
        className={[
          "max-w-[85%] min-w-0",
          isOwn ? "items-end" : "items-start",
        ].join(" ")}
      >
        {!isOwn ? (
          <p className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted dark:text-zinc-500">
            {msg.senderName}
          </p>
        ) : null}
        <div
          className={[
            "relative rounded-2xl px-3 py-1.5 text-sm leading-snug",
            isOwn
              ? "bg-accent-blue/15 text-foreground dark:bg-accent-blue/25 dark:text-zinc-100"
              : "bg-foreground/[0.06] text-foreground dark:bg-zinc-100/[0.06] dark:text-zinc-100",
          ].join(" ")}
        >
          <span className="whitespace-pre-wrap break-words">{msg.body}</span>
          {/* WhatsApp-style meta placement. An invisible inline spacer
              the same size as the meta sits at the end of the text so
              the bubble's content width includes the meta's footprint
              — when the last line of text would clip the meta, the
              spacer wraps to a new line, leaving room for the
              absolutely-positioned real meta at the bottom-right. For
              short messages the meta sits next to the text on the
              same line; for wrapping messages it lands in the corner.
              Keeps the bubble's height growth to a minimum. */}
          <span
            className="invisible ml-2 inline-flex select-none items-center gap-1 align-bottom text-[10px] leading-none"
            aria-hidden
          >
            <span>{formatTime(msg.createdAt)}</span>
            {isOwn ? <span className="block h-3.5 w-3.5" /> : null}
          </span>
          <span
            className={[
              "absolute right-2.5 bottom-1 inline-flex items-center gap-1 text-[10px] leading-none",
              isOwn
                ? "text-muted/70 dark:text-zinc-500"
                : "text-muted/70 dark:text-zinc-500",
            ].join(" ")}
          >
            <span>{formatTime(msg.createdAt)}</span>
            {isOwn ? (
              msg.status === "pending" ? (
                <AppIcon
                  icon="lucide:check"
                  className="h-3 w-3 text-muted/80"
                  aria-label="Sent"
                />
              ) : (
                <AppIcon
                  icon="lucide:check-check"
                  className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400"
                  aria-label="Delivered"
                />
              )
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Boot-time skeleton — fills the chat panel during the brief
 *  Virtuoso measurement window on every Chat-tab activation, so the
 *  user lands on placeholder rows instead of a flash of empty space.
 *  Stacks at the bottom (justify-end) to mirror the natural chat
 *  reading position (latest at bottom). */
function ChatBootSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end overflow-hidden">
      <ChatRowSkeletons count={6} />
    </div>
  );
}

/** Skeleton placeholders shown briefly at the top during scroll-up.
 *  Cosmetic — the data is already on the client. */
function ChatRowSkeletons({ count }: { count: number }) {
  return (
    <ul className="list-none space-y-0 py-1.5 pl-0 pr-0 sm:py-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="px-2.5 py-1 sm:px-3">
          <div
            className={[
              "flex w-full",
              i % 2 === 0 ? "justify-start" : "justify-end",
            ].join(" ")}
          >
            <div className="max-w-[60%] animate-pulse space-y-1.5">
              <div className="h-2.5 w-20 rounded bg-muted/40 dark:bg-zinc-800/60" />
              <div className="h-7 w-44 rounded-2xl bg-muted/40 dark:bg-zinc-800/60" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Three small pulsing dots beside the typing facepile. CSS-only via
 *  inline `animationDelay` on each span — no extra `@keyframes`
 *  needed because Tailwind's `animate-pulse` already pulses opacity. */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="block h-1 w-1 animate-pulse rounded-full bg-muted dark:bg-zinc-500"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
