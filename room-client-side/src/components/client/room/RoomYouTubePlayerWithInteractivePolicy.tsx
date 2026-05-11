"use client";

import { forwardRef, type ComponentProps } from "react";
import {
  RoomYouTubePlayer,
  type RoomYouTubePlayerHandle,
} from "@/components/client/room/RoomYouTubePlayer";
import { useCanControlPlayback } from "@/components/client/room/useRoomPolicyGates";

type BaseProps = ComponentProps<typeof RoomYouTubePlayer>;

export type RoomYouTubePlayerWithInteractivePolicyProps = Omit<
  BaseProps,
  "interactive"
> & {
  roomId: string;
  currentUserId: string | null;
  roomCreatedBy: string | null;
};

/**
 * Subscribes narrowly to `editAccess` + membership for `interactive`.
 * Avoids coupling the room page to full `roomSettings` updates (e.g. loop).
 */
export const RoomYouTubePlayerWithInteractivePolicy = forwardRef<
  RoomYouTubePlayerHandle,
  RoomYouTubePlayerWithInteractivePolicyProps
>(function RoomYouTubePlayerWithInteractivePolicy(
  { roomId, currentUserId, roomCreatedBy, ...rest },
  ref,
) {
  const interactive = useCanControlPlayback(
    roomId,
    currentUserId,
    roomCreatedBy,
  );
  return (
    <RoomYouTubePlayer ref={ref} {...rest} interactive={interactive} />
  );
});

RoomYouTubePlayerWithInteractivePolicy.displayName =
  "RoomYouTubePlayerWithInteractivePolicy";
