# Local LiveKit Server (for the **Meet** app)

The **Meet** application in MJ Explorer (multi-party live audio/video/screen rooms with people and
MJ agents) is built on the **MJ-native LiveKit bridge**. LiveKit is a standalone media server (an
SFU) that actually routes the WebRTC media between participants. This folder runs one locally, in
Docker, for development and testing.

> **Which LiveKit do I run?**
> - **Local development** → run a throwaway server yourself: **Docker** (this folder) for browser-only
>   room testing, or **native** `livekit-server` for the agent-bot path on macOS. See
>   [§1](#1-start-the-server) and the [macOS section](#-macos-run-livekit-natively-for-the-agent-meet-path).
> - **Production / real-world deployments** → use **[LiveKit Cloud](https://cloud.livekit.io)** — no
>   server to run, just credentials in `.env`. See [Production](#production--real-world-use-livekit-cloud) below. **This is the recommended path for anything beyond local dev.**

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

## 🚨 macOS: run LiveKit NATIVELY for the agent (Meet) path

On **macOS**, Docker Desktop's NAT breaks the **server-side agent bot's** WebRTC media. The bot is
`@livekit/rtc-node` running **inside MJAPI on the host**; the Dockerized LiveKit advertises its
*container* IP (e.g. `172.x`) for media candidates, which the host bot can't reach — and the TCP
candidate points at the same unreachable IP, so the fallback doesn't save it. Symptom: the Live Room
spins, then **`StartLiveKitAgentRoomSession failed: ... wait_pc_connection timed out`**. (Signaling on
`7880` is fine — only the media peer-connection fails.)

**Fix: run LiveKit natively** (no Docker NAT) using THIS repo's config, so your `.env` stays unchanged
(same `devkey` + secret):

```bash
brew install livekit
livekit-server --config docker/livekit/livekit.yaml     # binds to localhost — bot connects
```

Stop the Docker container first (`docker compose down`) so they don't both hold port 7880. The Docker
setup here is still handy for **browser-only** room testing (the browser can use the mapped TCP
fallback), but the **agent bot needs native LiveKit or Cloud** on macOS.

## Production / real-world: use LiveKit Cloud

**For anything beyond local dev, use [LiveKit Cloud](https://cloud.livekit.io).** Create a project and
it gives you a `wss://…livekit.cloud` URL plus an API key and secret — drop those three into the
repo-root `.env` exactly as in [§2](#2-configure-mjapi) and restart MJAPI. There is **no server to run**
and none of the local NAT/TURN headaches: the Docker/native steps above are *only* for local dev.

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=your-livekit-cloud-secret
```

Self-hosting for production is also possible but additionally needs real keys and proper
networking/TURN for media traversal; see the
[LiveKit deployment docs](https://docs.livekit.io/home/self-hosting/deployment/).

## Security

The keys here (`devkey` / `mj-local-dev-livekit-secret-0123456789`) are well-known throwaways for local use **only**. Never commit
real LiveKit credentials, and never point this permissive dev config at a public address.
