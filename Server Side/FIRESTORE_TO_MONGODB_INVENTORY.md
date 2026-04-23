# Firestore → MongoDB migration inventory

This document lists everything the Room App currently stores or reads from **Firestore**, as implemented under `Client Side/`. Use it when designing Mongo collections, indexes, and Socket/API payloads.

---

## 1. `rooms/{roomId}`

**Path:** top-level collection `rooms`, document id = room id (same id used in the app URL / join flow).

**Fields written (create):**

| Field         | Type (app) | Notes |
|---------------|------------|--------|
| `creatorId`   | string     | Today: anonymous id from client `localStorage` (not Firebase Auth). |
| `creatorName` | string     | Display name at create time. |
| `roomName`    | string     | Shown to joiners; length 1–200 in rules. |
| `private`     | boolean    | `false` on create; when `true`, join flow treats room as private (`getRoomJoinCheck`). |
| `createdAt`   | timestamp  | `serverTimestamp()` on create. |

**Fields read / subscribed:**

- Same fields via `onSnapshot` for live room header / join UX (`useRoomDocument`).

**Operations today:**

- **Create:** batch with room + members stub + owner member (`createRoomDocument`).
- **Read:** `getDoc` for join check; `onSnapshot` for live updates.
- **Update:** `updateDoc` only for `{ private }` (`updateRoomPrivate`).
- **Delete:** not used client-side; rules disallow delete.

**Query / index notes for Mongo:**

- Primary key: `roomId` (string).
- No compound queries on `rooms` in code beyond single-doc read/listen.

---

## 2. `room-members/{roomId}` (parent stub)

**Path:** document `room-members/{roomId}` (no subcollection on this doc for the stub itself).

**Fields:**

| Field    | Type   | Notes |
|----------|--------|--------|
| `roomId` | string | Must match path `roomId`; rules require `keys().hasOnly(['roomId'])`. |

**Operations:**

- Set in the same batch as room create (`merge: true` on stub).

**Purpose:** Lightweight parent so subcollection `items` has a logical parent in Firestore. In Mongo you may fold this into a `rooms` document or omit if redundant.

---

## 3. `room-members/{roomId}/items/{userId}`

**Path:** subcollection `items` under `room-members/{roomId}`; **document id must equal** `userId` (enforced in app and rules).

**Fields:**

| Field     | Type    | Notes |
|-----------|---------|--------|
| `roomId`  | string  | Redundant with path; must match parent `roomId`. |
| `access`  | boolean | Always `true` on create today. |
| `role`    | string  | `'ownerAdmin'` or `'member'` (`OWNER_ADMIN_ROLE` / `MEMBER_ROLE`). |
| `userID`  | string  | Same as document id / user id (rules: `userId == request.resource.data.userID`). |
| `userName`| string  | Display name; 1–200 chars in rules. |

**Operations:**

- **Create:** owner row in batch with room create; joiners via `addRoomMemberDocument` / `ensureRoomMemberForSession` (setDoc if missing).
- **Read:** `onSnapshot` on whole `items` collection (`useRoomMembers`); client sorts: `ownerAdmin` first, then by `userName`.
- **Update / delete:** not used; rules disallow.

**Query / index notes for Mongo:**

- List members by `roomId` (all rows where `room_id` = X).
- Natural unique key: `(roomId, userId)`.

---

## 4. `room-queue/{roomId}/items/{clipId}`

**Path:** collection `room-queue`, doc `roomId`, subcollection `items`, doc `clipId` = client-generated **UUID** (`crypto.randomUUID()`).

**Fields:**

| Field          | Type      | Notes |
|----------------|-----------|--------|
| `addedAt`      | timestamp | `serverTimestamp()` on create; used for ordering. |
| `userId`       | string    | Who queued (anonymous id string today). |
| `username`     | string    | Display name when queued. |
| `youtubeLink`  | string    | Full URL or text; rules max 2048; app parses YouTube id client-side. |

**Operations:**

- **Create:** `setDoc` per clip (`addRoomQueueEntry`); returns `clipId`.
- **Read:** `onSnapshot` + `orderBy('addedAt', 'asc')` (`useRoomQueueSubscription`). Entries without a parseable YouTube id are skipped in the UI callback.
- **Update / delete:** not used; rules disallow.

**Query / index notes for Mongo:**

- List queue items by `roomId`, sort by `addedAt` ascending.
- Index: `{ roomId: 1, addedAt: 1 }` (typical).

---

## 5. Firestore security rules (behavioral contract)

File: `Client Side/firestore.rules` (not data, but defines intended constraints):

- **`rooms`:** public read; create with required keys/types; update only if immutable fields unchanged except `private`; no delete.
- **`room-members/{roomId}`:** public read; create/update with only `roomId` matching path; no delete.
- **`room-members/.../items/{userId}`:** public read; create with schema + `userId` match; no update/delete.
- **`room-queue/.../items/{clipId}`:** public read; create with schema + clip id length; no update/delete.

Mongo + server auth should re-implement these constraints as validation middleware, not as Firestore rules.

---

## 6. Source files to replace when dropping Firestore

| Area        | Files |
|-------------|--------|
| Room CRUD   | `Client Side/src/lib/firebase/room-document.ts` |
| Queue write | `Client Side/src/lib/firebase/room-queue-document.ts` |
| Live room   | `Client Side/src/hooks/use-room-document.ts` |
| Live members| `Client Side/src/hooks/use-room-members.ts` |
| Live queue  | `Client Side/src/hooks/use-room-queue-subscription.ts` |
| Firebase app| `Client Side/src/lib/firebase/client-app.ts` |
| Rules       | `Client Side/firestore.rules` (remove or archive) |

Call sites: `use-create-room.ts`, `JoinRoomForm.tsx`, `RoomShell.tsx`, and related room UI.

---

## 7. Not in Firestore

- Anonymous user id / display name persistence: **`localStorage`** (`Client Side/src/lib/anonymous-user.ts`), not Firestore.
- Theme preference: local (`ThemeContext` / `theme-preference.ts`), not Firestore.

---

*Generated from codebase scan; extend this file if you add new collections or fields before migration completes.*
