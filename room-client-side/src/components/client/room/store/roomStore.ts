"use client";

import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemePreference } from "@/lib/theme-preference";
import type {
  ChatMessageWire,
  JoinRequestWire,
  VideoAddRequestWire,
} from "@/lib/ws-events";
import type { RoomQueueEntry } from "@/lib/room-types";

export type LocalChatMessage = ChatMessageWire & {
  status: "pending" | "delivered";
  clientNonce?: string;
};

type RoomState = {
  sessionStarted: boolean;
  past: RoomQueueEntry[];
  nowPlaying: RoomQueueEntry | null;
  cues: RoomQueueEntry[];
  videoUrl: string;
  joinRequests: JoinRequestWire[];
  addRequests: VideoAddRequestWire[];
  chatMessages: LocalChatMessage[];
  chatUnreadCount: number;
  chatFirstUnreadIndex: number;
  typers: Record<string, { name: string }>;
};

type RoomStore = RoomState & {
  setVideoUrl: (value: string) => void;
  addQueueItem: (entry: RoomQueueEntry) => void;
  advanceTo: (absoluteIndex: number, loop?: boolean) => void;
  hydrateQueue: (items: RoomQueueEntry[]) => void;
  resetQueue: () => void;
  setJoinRequests: (requests: JoinRequestWire[]) => void;
  upsertJoinRequest: (request: JoinRequestWire) => void;
  removeJoinRequest: (requestId: string) => void;
  setAddRequests: (requests: VideoAddRequestWire[]) => void;
  upsertAddRequest: (request: VideoAddRequestWire) => void;
  removeAddRequest: (requestId: string) => void;
  setChatHistory: (messages: ChatMessageWire[]) => void;
  appendChatMessage: (message: ChatMessageWire) => void;
  addOptimisticChatMessage: (message: LocalChatMessage) => void;
  markChatDelivered: (clientNonce: string, id: string, createdAt: number) => void;
  removeOptimisticChatMessage: (clientNonce: string) => void;
  markChatReadToLatest: () => void;
  setTyper: (userId: string, userName: string) => void;
  clearTyper: (userId: string) => void;
  clearTypers: () => void;
};

const initialState: RoomState = {
  sessionStarted: false,
  past: [],
  nowPlaying: null,
  cues: [],
  videoUrl: "",
  joinRequests: [],
  addRequests: [],
  chatMessages: [],
  chatUnreadCount: 0,
  chatFirstUnreadIndex: -1,
  typers: {},
};

function combinedQueue(state: Pick<RoomState, "past" | "nowPlaying" | "cues">) {
  return [
    ...state.past,
    ...(state.nowPlaying ? [state.nowPlaying] : []),
    ...state.cues,
  ];
}

function createRoomStore(): StoreApi<RoomStore> {
  return createStore<RoomStore>()((set) => ({
    ...initialState,
    setVideoUrl: (value) => set({ videoUrl: value }),
    addQueueItem: (entry) =>
      set((state) => {
        if (!state.sessionStarted) {
          return {
            sessionStarted: true,
            nowPlaying: entry,
            videoUrl: "",
          };
        }
        if (state.nowPlaying) {
          return { cues: [...state.cues, entry], videoUrl: "" };
        }
        return { nowPlaying: entry, videoUrl: "" };
      }),
    advanceTo: (absoluteIndex, loop) =>
      set((state) => {
        const combined = combinedQueue(state);
        if (absoluteIndex < 0) return {};
        if (absoluteIndex >= combined.length) {
          if (loop && combined.length > 0) {
            return {
              past: [],
              nowPlaying: combined[0],
              cues: combined.slice(1),
            };
          }
          return { past: combined, nowPlaying: null, cues: [] };
        }
        return {
          past: combined.slice(0, absoluteIndex),
          nowPlaying: combined[absoluteIndex],
          cues: combined.slice(absoluteIndex + 1),
        };
      }),
    hydrateQueue: (items) =>
      set(() => {
        if (items.length === 0) return {};
        const [first, ...rest] = items;
        return {
          sessionStarted: true,
          past: [],
          nowPlaying: first,
          cues: rest,
          videoUrl: "",
        };
      }),
    resetQueue: () =>
      set({
        sessionStarted: false,
        past: [],
        nowPlaying: null,
        cues: [],
      }),
    setJoinRequests: (joinRequests) => set({ joinRequests }),
    upsertJoinRequest: (request) =>
      set((state) => ({
        joinRequests: state.joinRequests.some((r) => r.id === request.id)
          ? state.joinRequests
          : [...state.joinRequests, request],
      })),
    removeJoinRequest: (requestId) =>
      set((state) => ({
        joinRequests: state.joinRequests.filter((r) => r.id !== requestId),
      })),
    setAddRequests: (addRequests) => set({ addRequests }),
    upsertAddRequest: (request) =>
      set((state) => ({
        addRequests: state.addRequests.some((r) => r.id === request.id)
          ? state.addRequests
          : [...state.addRequests, request],
      })),
    removeAddRequest: (requestId) =>
      set((state) => ({
        addRequests: state.addRequests.filter((r) => r.id !== requestId),
      })),
    setChatHistory: (messages) =>
      set({
        chatMessages: messages.map((message) => ({
          ...message,
          status: "delivered",
        })),
        chatUnreadCount: 0,
        chatFirstUnreadIndex: -1,
      }),
    appendChatMessage: (message) =>
      set((state) => {
        if (state.chatMessages.some((m) => m.id === message.id)) {
          return {};
        }
        const nextMessages: LocalChatMessage[] = [
          ...state.chatMessages,
          { ...message, status: "delivered" as const },
        ];
        const nextUnreadCount = state.chatUnreadCount + 1;
        return {
          chatMessages: nextMessages,
          chatUnreadCount: nextUnreadCount,
          chatFirstUnreadIndex:
            state.chatFirstUnreadIndex >= 0
              ? state.chatFirstUnreadIndex
              : nextMessages.length - 1,
        };
      }),
    addOptimisticChatMessage: (message) =>
      set((state) => ({
        chatMessages: [...state.chatMessages, message],
      })),
    markChatDelivered: (clientNonce, id, createdAt) =>
      set((state) => ({
        chatMessages: state.chatMessages.map((m) =>
          m.clientNonce === clientNonce
            ? {
                ...m,
                id,
                createdAt,
                status: "delivered",
                clientNonce: undefined,
              }
            : m,
        ),
      })),
    removeOptimisticChatMessage: (clientNonce) =>
      set((state) => {
        const removeIndex = state.chatMessages.findIndex(
          (m) => m.clientNonce === clientNonce,
        );
        if (removeIndex < 0) return {};
        const nextMessages = state.chatMessages.filter(
          (m) => m.clientNonce !== clientNonce,
        );
        if (state.chatUnreadCount === 0 || state.chatFirstUnreadIndex < 0) {
          return { chatMessages: nextMessages };
        }
        const unreadStart = state.chatFirstUnreadIndex;
        const removedUnread = removeIndex >= unreadStart;
        const nextUnreadCount = removedUnread
          ? Math.max(0, state.chatUnreadCount - 1)
          : state.chatUnreadCount;
        if (nextUnreadCount === 0) {
          return {
            chatMessages: nextMessages,
            chatUnreadCount: 0,
            chatFirstUnreadIndex: -1,
          };
        }
        const nextFirstUnreadIndex =
          removeIndex < unreadStart ? unreadStart - 1 : unreadStart;
        return {
          chatMessages: nextMessages,
          chatUnreadCount: nextUnreadCount,
          chatFirstUnreadIndex: nextFirstUnreadIndex,
        };
      }),
    markChatReadToLatest: () =>
      set((state) => {
        if (state.chatUnreadCount === 0 && state.chatFirstUnreadIndex === -1) {
          return {};
        }
        return {
          chatUnreadCount: 0,
          chatFirstUnreadIndex: -1,
        };
      }),
    setTyper: (userId, userName) =>
      set((state) => ({ typers: { ...state.typers, [userId]: { name: userName } } })),
    clearTyper: (userId) =>
      set((state) => {
        if (!state.typers[userId]) return {};
        const next = { ...state.typers };
        delete next[userId];
        return { typers: next };
      }),
    clearTypers: () => set({ typers: {} }),
  }));
}

const roomStores = new Map<string, StoreApi<RoomStore>>();

export function getRoomStore(roomId: string): StoreApi<RoomStore> {
  const existing = roomStores.get(roomId);
  if (existing) return existing;
  const created = createRoomStore();
  roomStores.set(roomId, created);
  return created;
}

export function clearRoomStore(roomId: string) {
  roomStores.delete(roomId);
}

export function useRoomStore<T>(roomId: string, selector: (state: RoomStore) => T): T {
  return useStore(getRoomStore(roomId), selector);
}

export function roomCombinedQueue(state: Pick<RoomState, "past" | "nowPlaying" | "cues">) {
  return combinedQueue(state);
}

type RoomUiPrefsState = {
  chatReceiveSoundEnabled: boolean;
  appTheme: ThemePreference | null;
  setChatReceiveSoundEnabled: (enabled: boolean) => void;
  setAppTheme: (theme: ThemePreference) => void;
};

const roomUiPrefsStore = createStore<RoomUiPrefsState>()(
  persist(
    (set) => ({
      chatReceiveSoundEnabled: true,
      appTheme: null,
      setChatReceiveSoundEnabled: (chatReceiveSoundEnabled) =>
        set({ chatReceiveSoundEnabled }),
      setAppTheme: (appTheme) => set({ appTheme }),
    }),
    {
      name: "room-chat-preferences",
    },
  ),
);

export function useRoomUiPrefsStore<T>(
  selector: (state: RoomUiPrefsState) => T,
): T {
  return useStore(roomUiPrefsStore, selector);
}
