# 003 — SFU (LiveKit) token for room members

## Goal

The **app server** mints short-lived **LiveKit access tokens** (JWT) so only authenticated, authorized room members can join the media session tied to `roomId`.

## Scope

- Add authenticated endpoint, e.g. `POST /rooms/:roomId/livekit/token` (name TBD).
- Validate: user is member (or elevated) of the room — same rules as queue/subscribe.
- Token claims: `room` name convention (e.g. `room:<roomId>` or sanitized id), `identity` = `userId`, display name, grants (can publish/subscribe as per product).
- Return: `{ url, token }` or whatever the LiveKit client expects.
- Rate-limit token minting.

## Acceptance criteria

- [ ] Non-members get 403/404 consistent with existing room APIs.
- [ ] Member receives a token that successfully connects to LiveKit (**002** running).
- [ ] Token TTL is bounded (e.g. 5–15 minutes) with refresh story noted for follow-up.

## Dependencies

- **002** (LiveKit URL + keys on server).

## Notes

- Do not expose API secret to the browser; only the **signed JWT** goes to the client.
