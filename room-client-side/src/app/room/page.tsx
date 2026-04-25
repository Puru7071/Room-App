"use client";

import { useCallback, useMemo, useReducer } from "react";
import { AmbientPageBackground } from "@/components/layout/AmbientPageBackground";
import { RoomAmbientBackdrop } from "@/components/client/room/RoomAmbientBackdrop";
import { RoomPageHeader } from "@/components/client/room/RoomPageHeader";
import { RoomQueuePanel } from "@/components/client/room/RoomQueuePanel";
import { RoomWatchLayout } from "@/components/client/room/RoomWatchLayout";
import { RoomYouTubePlayer } from "@/components/client/room/RoomYouTubePlayer";
import { DEFAULT_ROOM_YOUTUBE_VIDEO_ID } from "@/lib/app-constants";
import type { RoomQueueEntry } from "@/lib/room-types";
import { extractYouTubeVideoId } from "@/lib/youtube";

type RoomState = {
  sessionStarted: boolean;
  past: RoomQueueEntry[];
  nowPlaying: RoomQueueEntry | null;
  cues: RoomQueueEntry[];
  videoUrl: string;
};

const initialState: RoomState = {
  sessionStarted: false,
  past: [],
  nowPlaying: null,
  cues: [],
  videoUrl: "",
};

type RoomAction =
  | { type: "SET_VIDEO_URL"; value: string }
  | { type: "ADD_VIDEO"; entry: RoomQueueEntry }
  | { type: "ADVANCE_TO"; absoluteIndex: number };

function combinedQueue(state: RoomState): RoomQueueEntry[] {
  return [
    ...state.past,
    ...(state.nowPlaying ? [state.nowPlaying] : []),
    ...state.cues,
  ];
}

function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "SET_VIDEO_URL":
      return { ...state, videoUrl: action.value };
    case "ADD_VIDEO": {
      const { entry } = action;
      if (!state.sessionStarted) {
        return {
          ...state,
          sessionStarted: true,
          nowPlaying: entry,
          videoUrl: "",
        };
      }
      if (state.nowPlaying) {
        return { ...state, cues: [...state.cues, entry], videoUrl: "" };
      }
      return { ...state, nowPlaying: entry, videoUrl: "" };
    }
    case "ADVANCE_TO": {
      const combined = combinedQueue(state);
      const idx = action.absoluteIndex;
      if (idx < 0) return state;
      if (idx >= combined.length) {
        return { ...state, past: combined, nowPlaying: null, cues: [] };
      }
      return {
        ...state,
        past: combined.slice(0, idx),
        nowPlaying: combined[idx],
        cues: combined.slice(idx + 1),
      };
    }
  }
}

export default function RoomPage() {
  const [state, dispatch] = useReducer(roomReducer, initialState);

  const playlist = useMemo(() => combinedQueue(state), [state]);
  const currentIndex = state.nowPlaying ? state.past.length : -1;

  const phase: "default" | "playing" | "stopped" = !state.sessionStarted
    ? "default"
    : state.nowPlaying
      ? "playing"
      : "stopped";

  const handleAddVideo = useCallback(() => {
    const videoId = extractYouTubeVideoId(state.videoUrl);
    if (!videoId) return;
    dispatch({
      type: "ADD_VIDEO",
      entry: {
        clipId: crypto.randomUUID(),
        videoId,
        addedByName: "You",
      },
    });
  }, [state.videoUrl]);

  const handleAdvance = useCallback((absoluteIndex: number) => {
    dispatch({ type: "ADVANCE_TO", absoluteIndex });
  }, []);

  const handleQueueJump = useCallback(
    (
      payload:
        | { zone: "past"; index: number }
        | { zone: "next"; index: number },
    ) => {
      if (payload.zone === "past") {
        dispatch({ type: "ADVANCE_TO", absoluteIndex: payload.index });
      } else {
        const offset = state.nowPlaying ? 1 : 0;
        dispatch({
          type: "ADVANCE_TO",
          absoluteIndex: state.past.length + offset + payload.index,
        });
      }
    },
    [state.past.length, state.nowPlaying],
  );

  const ambientVideoId =
    state.nowPlaying?.videoId ??
    state.past[state.past.length - 1]?.videoId ??
    DEFAULT_ROOM_YOUTUBE_VIDEO_ID;

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <AmbientPageBackground />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
        <RoomAmbientBackdrop videoId={ambientVideoId} />

        <RoomPageHeader
          roomId="demo-room"
          roomName="Demo Room"
          videoUrl={state.videoUrl}
          onVideoUrlChange={(value) =>
            dispatch({ type: "SET_VIDEO_URL", value })
          }
          onAddVideo={handleAddVideo}
          roomMembers={[]}
        />

        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <RoomWatchLayout
            player={
              <RoomYouTubePlayer
                phase={phase}
                playlist={playlist}
                currentIndex={currentIndex}
                onAdvance={handleAdvance}
              />
            }
            queue={
              <RoomQueuePanel
                past={state.past}
                nowPlaying={state.nowPlaying}
                cues={state.cues}
                sessionStarted={state.sessionStarted}
                phase={phase}
                onJump={handleQueueJump}
                className="min-h-0"
              />
            }
          />
        </main>
      </div>
    </div>
  );
}
