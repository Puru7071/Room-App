# 001 — Self video in the video panel (local only)

## Goal

Show the **current user’s** camera preview in the room’s video panel using `getUserMedia`. No SFU, no multi-peer yet.

## Scope

- Request video (and optionally audio muted locally for preview-only).
- Render `<video>` (or equivalent) in the designated panel; mirror for front camera if desired.
- Handle permissions denied / no device gracefully (empty state + copy).
- Cleanup: stop tracks on unmount or when leaving the panel.

## Acceptance criteria

- [ ] Joining a room shows the user’s own video in the video panel when camera permission is granted.
- [ ] Navigating away or closing the panel releases camera/mic (no leaked tracks in devtools).
- [ ] Permission denied shows a clear inline message (no uncaught promise noise).

## Dependencies

- None (pure client).

## Notes

- Keep this isolated from Socket.IO / LiveKit so the next tickets can plug in without rewriting UI.
