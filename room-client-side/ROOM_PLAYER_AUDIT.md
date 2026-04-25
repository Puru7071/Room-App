# Room Player + Queue — Bug Audit

**Status:** draft, awaiting your sign-off before fixing or installing test infra.

## How I went about this

Walked through every state transition by hand against the live code in
[src/app/room/page.tsx](src/app/room/page.tsx) and
[src/components/client/room/RoomYouTubePlayer.tsx](src/components/client/room/RoomYouTubePlayer.tsx). The
queue panel and member facepile are pure rendering — no internal state — so
they can't be the source of a "stale display" bug; the cause is always
upstream in either the reducer or the player's sync logic.

The reducer (`roomReducer` + `combinedQueue` in `page.tsx`) is
straightforward and I couldn't find a reducer-level bug. **All real bugs live
in the player's sync logic.**

## Bugs

### B1 — Brief wrong-video flash on session restart

**Severity:** medium (visual glitch, ~100–500 ms)
**Where:** [RoomYouTubePlayer.tsx:71-77](src/components/client/room/RoomYouTubePlayer.tsx#L71)

When the queue runs out (phase: `playing` → `stopped`) and the user adds a
fresh video, `sessionSnapshotRef` is recreated using `playlist` —
which is `combinedQueue(state)`, i.e. **past + nowPlaying + cues**.

So at session restart with `past=[A,B,C], nowPlaying=D, cues=[]`:
- `firstVideoId = "A"` ← the *first played video of the previous session*
- `playlistParam = "B,C,D"`

The iframe mounts on A, then `onReady` fires `playVideoAt(currentIndex)` to
seek to D. The user sees A flash before D loads.

**Fix:** the snapshot should describe only what the new session needs to
play, not history:

```ts
const upcomingIds = cues.map(c => c.videoId);
sessionSnapshotRef.current = {
  firstVideoId: nowPlaying.videoId,
  playlistParam: upcomingIds.join(","),
  ids: [nowPlaying.videoId, ...upcomingIds],
};
```

### B2 — Refs not reset on session end

**Severity:** low (latent — only bites in a specific multi-session flow)
**Where:** [RoomYouTubePlayer.tsx:78-80](src/components/client/room/RoomYouTubePlayer.tsx#L78)

When phase transitions out of `"playing"`, only `sessionSnapshotRef` is
cleared. Other refs survive into the next session:

- `pendingPlaylistUpdate.current` — could carry stale playlist ids.
- `suppressNextPlayEventRef.current` — could swallow the first PLAYING event
  of the next session (visible as the first `state=1` being mis-handled).

`ytIdsRef` and `ytCurrentIndexRef` are reset by the next `onReady`, so those
are OK in practice — but it's inconsistent that some are reset and others
aren't.

**Fix:** reset all of them in the snapshot-clearing branch.

### B3 — User-reported: queue panel doesn't update after natural advance from a manual jump

**Severity:** high (this is the bug you flagged)
**Where:** likely the `onStateChange` path in
[RoomYouTubePlayer.tsx:213](src/components/client/room/RoomYouTubePlayer.tsx#L213)

**Repro (your words):** click a video in the queue panel → that video plays
→ video finishes → iframe correctly auto-advances to the next video, but the
queue panel still shows the previous video as "now playing."

**What this implies:** for the queue panel to be stuck on the old video, the
React state's `nowPlaying` didn't advance. That means either (a) `state=0`
didn't fire for the ended video, or (b) `state=0` fired but our handler
didn't dispatch `onAdvance`, or (c) `onAdvance` dispatched but with a stale
index that didn't move the reducer forward.

**What I can rule out from code-reading:**
- (b) is unlikely — the `state=0` block calls `onAdvance(nextIdx)`
  unconditionally on both code paths (the pending-flush branch at L233-244
  and the regular branch at L253-262).
- `onAdvance` is `useCallback` with empty deps in `page.tsx:103-105`, so
  it's a stable reference; the closure can't be capturing a stale dispatcher.
- The reducer is deterministic — given the dispatched `absoluteIndex`, it
  always slices `combined` correctly.

**What I cannot rule out without runtime evidence:**
- `react-youtube` may register the *first* `onStateChange` closure and not
  swap in fresh closures on re-render — but since the handler reads
  everything via refs (`ytCurrentIndexRef`, `ytIdsRef`,
  `pendingPlaylistUpdate`) and calls a stable `onAdvance`, even a stale
  closure should still produce the right dispatch.
- YouTube's internal playlist auto-advance interacting with our explicit
  `playVideoAt(nextIdx)` on `state=0` may, in some condition, suppress a
  follow-up `state=0` event, causing one missed advance and the symptom you
  describe. This would happen *after* the manual jump (because the manual
  jump uses `playVideoAt` to land on the new video, after which YT's native
  auto-advance and our handler are both contending for control).

**Action:** This is the highest-value test to write — a vitest +
`react-youtube` mock that simulates the exact sequence and asserts the
final React state. If the test fails, we have a deterministic repro and
the fix becomes obvious.

### B4 — Architectural: dual state machines, no test net

**Severity:** the meta-issue
**Where:** the whole sync architecture

The current player keeps two playlists in sync (React state vs. YT
iframe's internal playlist) via four refs and a 50-line `useEffect` with
four branches. Every bug we've fixed in this area has been a reconciliation
edge case, and right now the player has zero automated coverage. This is
why the same class of bug keeps reappearing.

I've previously offered two ways out — (a) collapse to one source of
truth and lose hard-guaranteed background autoplay, or (b) commit to the
current reconciliation pattern but cover it with tests so changes don't
regress. We've cycled. **My recommendation now is (b)** — keep the current
pattern (background autoplay matters to you), and use the test suite as
the safety net the architecture has been missing.

## Test plan

Once you sign off, I'd install vitest + `@testing-library/react` + jsdom
and write three layers:

1. **Reducer tests** (low-risk, will pass — establishes a baseline).
   Covers all action types, the session-restart path (ADD when
   `sessionStarted=true && nowPlaying===null`), out-of-range
   `ADVANCE_TO`, and `combinedQueue` invariants. Needs a tiny refactor:
   export `roomReducer`, `initialState`, and `combinedQueue` from
   `page.tsx` (or, cleaner, move them to `src/lib/room-reducer.ts`).

2. **Page handler tests** — verify `handleAddVideo`, `handleQueueJump`
   (both zones), and `handleAdvance` produce the right
   `dispatch` payloads.

3. **Player integration tests** with a mocked `react-youtube`. Simulate:
   - mount → `onReady` → `state=1` (initial play)
   - manual jump (effect calls `playVideoAt`) → mock fires `state=1`
     for new video
   - **the bug**: mock fires `state=0` after the manually-jumped video
     ends; assert `onAdvance` was called with `nextIdx` and that React
     state's `nowPlaying` advanced
   - background-tab simulation (multiple `state=0` events queued
     before flush)
   - mid-playback add (deferred via `pendingPlaylistUpdate`, flushed on
     next `state=0`)
   - session-restart flow (B1 repro)

Layer 3 is what will actually surface B3 as a failing test we can then fix.

## Proposed next steps (awaiting your nod)

1. Install vitest + testing-library + jsdom.
2. Refactor `roomReducer` to `src/lib/room-reducer.ts` (~10-line move).
3. Write the three test layers above.
4. Confirm B3 reproduces in a test.
5. Fix B1, B2, B3 — each as a separate small change with the test as proof.

If you want me to prioritize differently — e.g., skip the test infra and
just patch B1+B2 immediately while we manually re-test for B3 — say so.
