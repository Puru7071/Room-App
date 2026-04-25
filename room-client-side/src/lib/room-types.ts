export const OWNER_ADMIN_ROLE = "owner-admin" as const;
export const MEMBER_ROLE = "member" as const;

export type RoomMemberRow = {
  userId: string;
  userName: string;
  role: typeof OWNER_ADMIN_ROLE | typeof MEMBER_ROLE;
};

export type RoomQueueEntry = {
  clipId: string;
  videoId: string;
  addedByName: string;
};
