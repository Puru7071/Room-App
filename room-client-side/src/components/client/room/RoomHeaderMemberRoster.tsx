"use client";

import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRoomStore } from "@/components/client/room/store/roomStore";
import { RoomMemberFacepile } from "@/components/client/room/RoomMemberFacepile";

type RoomHeaderMemberRosterProps = {
  roomId: string;
  /** Owner or co-owner — can promote members. */
  isElevated?: boolean;
  /** Room creator only — can demote co-owners. */
  isRoomCreator?: boolean;
  currentUserId?: string | null;
};

function RoomHeaderMemberRosterInner({
  roomId,
  isElevated = false,
  isRoomCreator = false,
  currentUserId = null,
}: RoomHeaderMemberRosterProps) {
  const members = useRoomStore(roomId, useShallow((s) => s.members));
  return (
    <RoomMemberFacepile
      roomId={roomId}
      members={members}
      isElevated={isElevated}
      isRoomCreator={isRoomCreator}
      currentUserId={currentUserId}
    />
  );
}

export const RoomHeaderMemberRoster = memo(RoomHeaderMemberRosterInner);
