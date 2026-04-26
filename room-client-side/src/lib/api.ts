/**
 * Thin wrappers around the server's /auth and /rooms endpoints.
 *
 * Normalizes the server's response shape into a discriminated union so callers
 * can `if (res.ok) { … } else { … }` without juggling HTTP statuses themselves.
 * Errors from `fetch` itself (network down, CORS blocked) surface as
 * `{ ok: false, error: "..." }` with no `field`, so the form can show a
 * generic message instead of crashing.
 */

import { clearAuthToken, getAuthToken } from "@/lib/auth-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:9900";

export type ApiFieldError = "email" | "username" | "password" | "otp";

/**
 * `reason` lets the client distinguish error sub-types that share a `field`.
 *
 *  - `invalid` / `expired` — `/auth/verify-otp` (code mismatch vs expired).
 *  - `limit-reached` — `/rooms/create` returned 409 because the user is at
 *    the per-account room cap.
 */
export type ApiErrorReason = "invalid" | "expired" | "limit-reached";

export type ApiResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      field?: ApiFieldError;
      reason?: ApiErrorReason;
    };

export type SignupArgs = { email: string; username: string; password: string };

export type AuthUser = {
  userId: string;
  email: string;
  username: string;
  profilePicUrl: string | null;
};

export type VerifyOtpResult = { token: string; user: AuthUser };

export type LoginArgs = { email: string; password: string };

/** Login returns the same shape as a successful signup-verify — JWT + user. */
export type LoginResult = { token: string; user: AuthUser };

async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }

  // Rate-limiter middleware responds with the same JSON shape, but some edge
  // cases (e.g. a Cloudflare HTML error page) aren't JSON — guard for that.
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: `Unexpected server response (HTTP ${response.status}).` };
  }

  return data as ApiResult<T>;
}

export function signup(args: SignupArgs) {
  return postJson<Record<string, never>>("/auth/signup", args);
}

export function verifyOtp(args: { email: string; otp: string }) {
  return postJson<VerifyOtpResult>("/auth/verify-otp", args);
}

export function login(args: LoginArgs) {
  return postJson<LoginResult>("/auth/login", args);
}

/**
 * Same shape as `postJson`, but reads the JWT from `localStorage` and sets
 * `Authorization: Bearer <token>`. On a 401 from the server (token missing,
 * invalid, or expired), clears the local token so the existing
 * `useAuthToken` bridge in `AuthGateForms` drops the user back to the gate
 * automatically — no manual orchestration needed at the call site.
 */
async function postJsonAuth<T>(
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  const token = getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: "You're signed out — please log in again.",
    };
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection.",
    };
  }

  if (response.status === 401) {
    clearAuthToken();
    return {
      ok: false,
      error: "Your session expired — please log in again.",
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      error: `Unexpected server response (HTTP ${response.status}).`,
    };
  }

  return data as ApiResult<T>;
}

export type CreateRoomArgs = { name: string };

export type CreatedRoom = {
  roomId: string;
  name: string;
  /** ISO-8601 string from the server (Postgres `timestamptz`). */
  createdAt: string;
  lastUsedAt: string;
};

export type CreateRoomResult = { room: CreatedRoom };

export function createRoom(args: CreateRoomArgs) {
  return postJsonAuth<CreateRoomResult>("/rooms/create", args);
}

/**
 * GET twin of `postJsonAuth`. Same auth + 401 handling — on a 401 the
 * token is cleared so the home-page bridge drops the user back to the
 * gate the next time they land there.
 */
async function getJsonAuth<T>(path: string): Promise<ApiResult<T>> {
  const token = getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: "You're signed out — please log in again.",
    };
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection.",
    };
  }

  if (response.status === 401) {
    clearAuthToken();
    return {
      ok: false,
      error: "Your session expired — please log in again.",
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      error: `Unexpected server response (HTTP ${response.status}).`,
    };
  }

  return data as ApiResult<T>;
}

export type RoomNature = "PUBLIC" | "PRIVATE";
export type RoomEditAccess = "ALL" | "LIMITED";
export type RoomAccessLevel = "ALL" | "LIMITED";

export type RoomSettingsDetail = {
  nature: RoomNature;
  loop: boolean;
  editAccess: RoomEditAccess;
  chatRights: RoomAccessLevel;
  videoAudioRights: RoomAccessLevel;
};

export type RoomDetail = {
  roomId: string;
  name: string;
  /** `userId` of the creator. The client compares this to its own JWT
   *  payload to decide whether the requester is the room owner. */
  createdBy: string;
  createdAt: string;
  lastUsedAt: string;
  settings: RoomSettingsDetail | null;
};

export type GetRoomResult = { room: RoomDetail };

export function getRoom(roomId: string) {
  return getJsonAuth<GetRoomResult>(`/rooms/${encodeURIComponent(roomId)}`);
}

/**
 * PATCH twin of `postJsonAuth`. Same auth + 401-clears-token pattern.
 */
async function patchJsonAuth<T>(
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  const token = getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: "You're signed out — please log in again.",
    };
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection.",
    };
  }

  if (response.status === 401) {
    clearAuthToken();
    return {
      ok: false,
      error: "Your session expired — please log in again.",
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      error: `Unexpected server response (HTTP ${response.status}).`,
    };
  }

  return data as ApiResult<T>;
}

export type UpdateRoomSettingsArgs = Partial<RoomSettingsDetail>;

export type UpdateRoomSettingsResult = { settings: RoomSettingsDetail };

export function updateRoomSettings(
  roomId: string,
  patch: UpdateRoomSettingsArgs,
) {
  return patchJsonAuth<UpdateRoomSettingsResult>(
    `/rooms/${encodeURIComponent(roomId)}/settings`,
    patch,
  );
}

/**
 * DELETE twin of `postJsonAuth`. Same auth + 401-clears-token pattern.
 * Body-less; the server reads everything from the URL + JWT.
 */
async function deleteJsonAuth<T>(path: string): Promise<ApiResult<T>> {
  const token = getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: "You're signed out — please log in again.",
    };
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection.",
    };
  }

  if (response.status === 401) {
    clearAuthToken();
    return {
      ok: false,
      error: "Your session expired — please log in again.",
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      error: `Unexpected server response (HTTP ${response.status}).`,
    };
  }

  return data as ApiResult<T>;
}

export type MyRoom = {
  roomId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
};

export type GetMyRoomsResult = { rooms: MyRoom[] };

export function getMyRooms() {
  return getJsonAuth<GetMyRoomsResult>("/rooms/mine");
}

export function deleteRoom(roomId: string) {
  return deleteJsonAuth<Record<string, never>>(
    `/rooms/${encodeURIComponent(roomId)}`,
  );
}

/**
 * Join status the server reports back:
 *
 *  - `joined` — the user is a member now (public room or leader bypass).
 *  - `already-member` — they were already in `RoomMember`; idempotent.
 *  - `pending` — private room: the request was queued for the leader.
 *    The client renders a "waiting" overlay until a WS event flips it.
 */
export type JoinRoomStatus = "joined" | "already-member" | "pending";

export type JoinRoomResult = {
  status: JoinRoomStatus;
  /** Present only when `status === "pending"` so the client can correlate
   *  the WS approve/reject event back to this request. */
  requestId?: string;
};

export function joinRoom(roomId: string) {
  return postJsonAuth<JoinRoomResult>(
    `/rooms/${encodeURIComponent(roomId)}/join`,
    {},
  );
}

/**
 * Wire shape of a persisted queue item. Mirrors the server response
 * from GET /rooms/:id/queue and the WS `room.queue.added` event.
 */
export type RoomQueueWireItem = {
  id: string;
  videoId: string;
  addedById: string;
  addedByName: string;
  /** ISO-8601 (Postgres `timestamptz`). */
  addedAt: string;
  position: number;
};

export type GetRoomQueueResult = { items: RoomQueueWireItem[] };

export function getRoomQueue(roomId: string) {
  return getJsonAuth<GetRoomQueueResult>(
    `/rooms/${encodeURIComponent(roomId)}/queue`,
  );
}

export type AddToRoomQueueResult = { item: RoomQueueWireItem };

export function addToRoomQueue(roomId: string, videoId: string) {
  return postJsonAuth<AddToRoomQueueResult>(
    `/rooms/${encodeURIComponent(roomId)}/queue`,
    { videoId },
  );
}
