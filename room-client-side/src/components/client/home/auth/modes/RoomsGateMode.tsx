"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createRoom } from "@/lib/api";
import { RoomFormCard } from "../parts/RoomFormCard";
import { authBlockOuter, gateCol, gateRowInner } from "../styles";

/**
 * Post-login screen with two side-by-side cards: Create + Join.
 *
 * - **Create** trims the name, calls `POST /rooms/create`, toasts the
 *   outcome, and on success navigates to `/room/[roomId]?name=…`.
 * - **Join** accepts either a bare room ID or a pasted URL like
 *   `http://localhost:3000/room/<id>`. Extracts the UUID from the
 *   input and navigates to `/room/<id>` — the room page then handles
 *   the actual `POST /rooms/:id/join` flow (public → instant, private
 *   → request waiting for the leader).
 *
 * Reuses the same `authBlockOuter` + `gateRowInner` + `gateCol` chrome as
 * the initial gate so transitioning from OTP doesn't shift the page layout.
 */
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function RoomsGateMode() {
  const router = useRouter();
  const [createName, setCreateName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = createName.trim();
    if (!trimmed) {
      toast.error("Give your room a name.");
      return;
    }
    setSubmitting(true);
    const result = await createRoom({ name: trimmed });
    setSubmitting(false);
    if (!result.ok) {
      // Per-account room cap surfaces with `reason: "limit-reached"`.
      // Steer the user to the My Rooms popover instead of just echoing
      // the raw error — they need to delete an existing room first.
      if (result.reason === "limit-reached") {
        toast.error(
          "You've hit the room limit. Open 'My rooms' (top-right) and delete one to make space.",
        );
        return;
      }
      toast.error(result.error);
      return;
    }
    toast.success(`Created "${result.room.name}"`);
    router.push(
      `/room/${result.room.roomId}?name=${encodeURIComponent(result.room.name)}`,
    );
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = joinId.trim();
    if (!trimmed) {
      toast.error("Paste a room ID or link.");
      return;
    }
    // Accept either a bare UUID or a pasted URL — extract the UUID
    // from the input if it's there, otherwise use what was typed.
    const match = trimmed.match(UUID_RE);
    const targetId = match ? match[0] : trimmed;
    router.push(`/room/${encodeURIComponent(targetId)}`);
  }

  return (
    <div className={authBlockOuter}>
      <div className={gateRowInner}>
        <div className={gateCol}>
          <RoomFormCard
            id="rooms-create-name"
            label="Room name"
            placeholder="Name your room — e.g. Stand-up night"
            buttonText="Create"
            variant="create"
            value={createName}
            onChange={setCreateName}
            disabled={submitting}
            loading={submitting}
            onSubmit={handleCreate}
          />
        </div>
        <div className={gateCol}>
          <RoomFormCard
            id="rooms-join-id"
            label="Room ID or link"
            placeholder="Paste a room ID or invite link"
            buttonText="Join"
            variant="join"
            value={joinId}
            onChange={setJoinId}
            disabled={submitting}
            onSubmit={handleJoin}
          />
        </div>
      </div>
    </div>
  );
}
