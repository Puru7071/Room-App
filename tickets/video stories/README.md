# Video stories — work tickets

All video-calling implementation tickets live in this folder.

## Recommended order (vs. your original list)

| File | What | Note |
|------|------|------|
| `001` | Local self-view only | No SFU; validates panel + `getUserMedia`. |
| `002` | Self-hosted LiveKit (SFU) | Infra before tokens connect to a real server. |
| `003` | SFU token API → frontend | JWT / join credentials per room member. |
| `004` | Publish & subscribe + **quality (simulcast)** | Your old **#4 + #7**: encodings are set when publishing; subscribers pick layer. |
| `005` | Fixed tile grid + hide off-screen + SFU subscription policy | Your **#5**: UI + server/SFU behavior stay aligned. |
| `006` | Pin, spotlight, large tile | Your **#6**. |

**Why move “quality” earlier?** Simulcast (multiple video layers) and audio bitrate caps are part of the **publisher’s WebRTC offer** and track settings. Adding them as a late ticket usually means rework of `004`. Treat **004** as: basic AV **plus** explicit simulcast tiers and subscriber layer selection hooks.

**Why LiveKit before token ticket?** In dev, the token issuer needs a LiveKit URL + API key/secret and a running server. You can stub tokens locally, but integration tests need `002` first.

---

## Your numbering → files

- Your **1** → `001`  
- Your **3** → `002` (reordered)  
- Your **2** → `003`  
- Your **4** + **7** → `004`  
- Your **5** → `005`  
- Your **6** → `006`
