# 006 — Participant controls: pin, spotlight, large tile

## Goal

Let users control layout: **pin** a participant to a slot, **spotlight** / **large** main stage + smaller thumbnails, consistent with **005** visibility rules.

## Scope

- Local UI state: pinned user id, “stage” user id (may match pin).
- Enforce max tiles; pinned user gets priority in visible set.
- Optional: broadcast “layout intent” to other clients via existing Socket.IO (so everyone sees same spotlight) — product decision; document if v1 is local-only.

## Acceptance criteria

- [ ] User can pin participant A; A stays in a reserved slot when others join.
- [ ] “Large screen” mode shows one dominant tile + strip of small tiles (or grid variant).
- [ ] Unpin / reset restores default ordering (e.g. active speaker or join order — document rule).

## Dependencies

- **005** (visibility + subscription policy).

## Notes

- If layout is synced across clients, define a small WS event schema and version it.
