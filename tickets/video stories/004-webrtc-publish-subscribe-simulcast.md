# 004 — Send audio/video to SFU; remote participants receive streams (+ quality / simulcast)

## Goal

Connect the web client to LiveKit using the token from **003**, **publish** local camera/mic, and **subscribe** to other participants’ tracks. Include **multi-quality video (simulcast)** and sensible audio from the start so we don’t rework transports later.

## Scope

- Integrate LiveKit client SDK in `room-client-side`.
- On “join media” (or auto when entering room — product decision): `Room.connect`, publish local video + audio.
- Subscribe to remote participants; attach remote tracks to the tile components introduced in **001** / **005**.
- **Simulcast**: enable standard layers (e.g. low / mid / high) on camera publication per LiveKit docs.
- **Audio**: single high-quality opus track; document max bitrate / dtx if we tune later.
- Wire disconnect / reconnect (basic): leave room on page leave.

## Acceptance criteria

- [ ] Two browsers in the same room see each other’s video and hear audio (with **002–003**).
- [ ] Simulcast is enabled on published video (verify in LiveKit debug or stats).
- [ ] Leaving the room unpublishes and disconnects cleanly.

## Dependencies

- **002**, **003**.

## Notes

- This ticket intentionally **merges** “different audio/video qualities” with first real publish: encodings are negotiated at publish time. **005** can then choose **which layer** each visible tile receives.
