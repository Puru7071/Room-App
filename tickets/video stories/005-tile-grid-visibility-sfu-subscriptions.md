# 005 — Fixed tile grid, hide off-screen participants, align SFU subscriptions

## Goal

UI shows a **fixed maximum** number of video tiles (product constant, e.g. 4 or 6). Participants not in visible slots are **not** shown. On the SFU/client side, **reduce or pause** subscriptions for non-visible participants so bandwidth and CPU match what’s on screen.

## Scope

- Layout: grid or fixed slots; empty slots optional.
- “Visible set” = which participant ids get a tile; others detached from DOM.
- Use LiveKit APIs to **mute** remote video subscriptions or prefer lower layer for thumbnails vs high for main (depends on **004** simulcast).
- Optional: intersection observer if tiles scroll; for fixed grid, visibility = slot membership.

## Acceptance criteria

- [ ] With N > max tiles, only max tiles render video elements.
- [ ] Participants outside visible set do not keep high-bitrate video subscriptions (document how we measure: browser stats or LiveKit dashboard).
- [ ] Switching who is visible updates subscriptions within ~1s without leaks.

## Dependencies

- **004**.

## Notes

- Exact policy (unsubscribe vs subscribe paused vs lowest simulcast layer) should match LiveKit best practices for your SDK version.
