# Local LiveKit Server (for the **Meet** app)

The **Meet** application in MJ Explorer (multi-party live audio/video/screen rooms with people and
MJ agents) is built on the **MJ-native LiveKit bridge**. LiveKit is a standalone media server (an
SFU) that actually routes the WebRTC media between participants. This folder runs one locally, in
Docker, for development and testing.

## How it fits together

```
 Browser(s) + MJ agent ──WebRTC──►  LiveKit server (this container, :7880/:7881/:7882)
        ▲                                   ▲
        │ join token (JWT)                  │ server-side room/egress APIs
        └────────────── MJAPI ──────────────┘
                 (mints tokens with the API key/secret; never proxies media)
```

- **MJAPI** holds `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, mints scoped JWT join tokens
  (`MintLiveKitClientToken` / `StartLiveKitAgentRoomSession`), and calls LiveKit's server-side APIs.
  It never touches the audio/video.
- **Browsers and the agent** connect to the LiveKit server **directly** using the URL in
  `LIVEKIT_URL` and the minted token.

So the LiveKit server runs **alongside** MJAPI — it is not part of it.

## 1. Start the server

```bash
cd docker/livekit
docker compose up -d
docker compose logs -f      # watch it come up; Ctrl-C to stop tailing
```

This starts `livekit/livekit-server` with [`livekit.yaml`](./livekit.yaml) — dev keys
`devkey` / `mj-local-dev-livekit-secret-0123456789`, signaling on `7880`, media on `7881` (TCP) and `7882` (UDP).

Stop / clean up with `docker compose down`.

## 2. Configure MJAPI

Add these to the repo-root **`.env`** (which `packages/MJAPI/.env` symlinks to). They MUST match the
`keys:` in `livekit.yaml`:

```dotenv
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=mj-local-dev-livekit-secret-0123456789
```

Restart MJAPI after adding them (`npm run start:api`) — the values are read from `process.env` at
startup by `LiveKitTokenService`.

## 3. Use it

Open MJ Explorer → the **Meet** app → **Live Room**. The `LiveKitTokenService is not configured`
error means MJAPI didn't see the three vars above (check the `.env` and that you restarted MJAPI).

## macOS / Docker media note

WebRTC media over **UDP** can fail to traverse Docker Desktop's NAT on macOS. That's fine for dev:
LiveKit automatically falls back to **TCP on `7881`**, which is mapped here and reachable, so calls
still connect. If you want native UDP performance, run the server natively instead of in Docker:

```bash
brew install livekit
livekit-server --dev        # same devkey/secret, binds to localhost
```

## Production / hosted alternative

For anything beyond local dev, use **LiveKit Cloud** (https://cloud.livekit.io) — create a project,
and it gives you a `wss://…livekit.cloud` URL plus an API key and secret to drop into `.env`. No
server to run. Self-hosting for production additionally needs real keys and proper networking/TURN
for media traversal; see the [LiveKit deployment docs](https://docs.livekit.io/home/self-hosting/deployment/).

## Security

The keys here (`devkey` / `mj-local-dev-livekit-secret-0123456789`) are well-known throwaways for local use **only**. Never commit
real LiveKit credentials, and never point this permissive dev config at a public address.
