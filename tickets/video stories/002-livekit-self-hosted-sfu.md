# 002 — Self-hosted SFU with LiveKit

## Goal

Run a **LiveKit server** (SFU) in a repeatable dev (and later prod) setup: HTTPS/WSS-ready, documented env vars, health check.

## Scope

- Choose deployment shape for dev: Docker Compose (recommended) or bare binary.
- Configure: API key + secret, domain or localhost TLS story for browser WebRTC.
- Document **TURN** requirement for restrictive networks (can be stub in dev with a note; prod needs coturn or LiveKit’s TURN integration).
- Verify with LiveKit CLI or minimal test client that the server accepts connections.

## Acceptance criteria

- [ ] `docker compose up` (or documented equivalent) starts LiveKit with persisted config.
- [ ] Env vars documented for `room-client-side` / `server-side` (URL, keys).
- [ ] README section: how to get `wss://` URL from LAN vs production.

## Dependencies

- None (infra).

## Notes

- LiveKit OSS = SFU + signaling; token issuance stays in **003** (your app server).
