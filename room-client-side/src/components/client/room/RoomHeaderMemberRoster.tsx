"use client";

import { memo, useMemo } from "react";
import { useRoomStore } from "@/components/client/room/store/roomStore";
import { RoomMemberFacepile } from "@/components/client/room/RoomMemberFacepile";

type RoomHeaderMemberRosterProps = {
  roomId: string;
  isOwner?: boolean;
  currentUserId?: string | null;
};

function RoomHeaderMemberRosterInner({
  roomId,
  isOwner = false,
  currentUserId = null,
}: RoomHeaderMemberRosterProps) {
  const members = useRoomStore(roomId, (s) => s.members);
  const stableMembers = useMemo(() => members, [members]);
  return (
    <RoomMemberFacepile
      roomId={roomId}
      members={stableMembers}
      isOwner={isOwner}
      currentUserId={currentUserId}
    />
  );
}

export const RoomHeaderMemberRoster = memo(RoomHeaderMemberRosterInner);
