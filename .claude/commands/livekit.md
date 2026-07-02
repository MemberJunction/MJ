---
action: Action to perform (start, stop, status, logs). Defaults to start.
mode: Backend to use (native, docker, auto). Defaults to auto — native on macOS, docker elsewhere.
---

# LiveKit Local Server

Start/stop a local **LiveKit media server (SFU)** for the **Meet** app — MJ's multi-party live audio/video/screen rooms and the realtime co-agent bridge. **Dev only.**

The config lives at `docker/livekit/` (`livekit.yaml` + `docker-compose.yml`). MJAPI never proxies media — it only mints LiveKit join tokens from the repo-root `.env` (`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, which must match `livekit.yaml`'s `keys:`). Browsers and the agent connect to LiveKit directly.

## Two backends

| Backend | When | How |
|---|---|---|
| **native** (`brew`) | **macOS + the agent/Meet path** — Docker Desktop NAT breaks the server-side agent bot's WebRTC media (the Dockerized server advertises its *container* IP; the host bot can't reach it → `StartLiveKitAgentRoomSession failed: ... wait_pc_connection timed out`). | `livekit-server --config docker/livekit/livekit.yaml` |
| **docker** | Browser-only room testing (no agent bot), or non-macOS. The browser uses the mapped TCP fallback on 7881. | `cd docker/livekit && docker compose up -d` |

**`auto` (default):** choose **native on macOS** (so the agent path works), **docker** otherwise. If the user explicitly passes `mode`, honor it.

Ports: `7880` signaling (ws) → this is `LIVEKIT_URL=ws://localhost:7880` · `7881` WebRTC/TCP · `7882` WebRTC/UDP.

---

## Preflight (run for every action except `logs`)

1. Confirm the repo-root `.env` has all three vars (names only — never print values):
   ```bash
   grep -oE '^LIVEKIT_(URL|API_KEY|API_SECRET)' .env 2>/dev/null | sort -u
   ```
   If any are missing, warn the user: MJAPI will show **"LiveKitTokenService is not configured"** until they're added to `.env` and MJAPI is restarted. (Dev keys must match `docker/livekit/livekit.yaml`'s `keys:` block.)
2. Resolve `mode` (`auto` → `native` on macOS via `[[ "$(uname)" == "Darwin" ]]`, else `docker`).

---

## Actions

### start

**Resolve mode, then:**

**native:**
1. Ensure the binary is installed (set it up via brew if needed):
   ```bash
   command -v livekit-server >/dev/null 2>&1 || brew install livekit
   ```
2. If port 7880 is already busy, report what's there and stop — don't double-start:
   ```bash
   lsof -nP -iTCP:7880 -sTCP:LISTEN
   ```
3. Launch as a **background process** (use the harness background-task mechanism, not a raw `&`), logging to `/tmp/livekit-server.log`:
   ```bash
   livekit-server --config docker/livekit/livekit.yaml
   ```
4. Verify it came up and capture the advertised node IP:
   ```bash
   sleep 1; lsof -nP -iTCP:7880 -sTCP:LISTEN; tail -5 /tmp/livekit-server.log
   ```
   Confirm the log's `nodeIP` matches the machine's current LAN IP (`ipconfig getifaddr en0`). **A stale advertised IP is the usual cause of `wait_pc_connection timed out`** — if it mismatches, restart the server (it re-detects on boot).

**docker:**
```bash
cd docker/livekit && docker compose up -d
docker compose ps
```

Report: server is up on `ws://localhost:7880`, which backend, and (native) the log path `/tmp/livekit-server.log`. Remind the user that the **agent/Meet path needs native on macOS**, and that MJAPI must already have the `LIVEKIT_*` vars.

### stop

Stop **both** backends (so nothing is left running regardless of how it was started):
```bash
# native
pkill -f 'livekit-server --config' && echo 'stopped native' || echo 'native not running'
# docker (only if a compose project exists)
docker compose -f docker/livekit/docker-compose.yml down 2>/dev/null || true
```
Verify the port is free:
```bash
sleep 1; lsof -nP -iTCP:7880 -sTCP:LISTEN && echo 'STILL LISTENING' || echo 'port 7880 free'
```

### status

Report whether LiveKit is up and on which backend:
```bash
echo '--- native process ---'; pgrep -fl 'livekit-server --config' || echo '(no native process)'
echo '--- port 7880 ---'; lsof -nP -iTCP:7880 -sTCP:LISTEN || echo '(nothing on 7880)'
echo '--- docker ---'; docker compose -f docker/livekit/docker-compose.yml ps 2>/dev/null || echo '(no docker project)'
```

### logs

Tail the active backend's logs (Ctrl-C to stop tailing):
```bash
# native
tail -f /tmp/livekit-server.log
# docker
docker compose -f docker/livekit/docker-compose.yml logs -f
```
Pick native if `/tmp/livekit-server.log` exists and a native process is running, otherwise docker.

---

## Notes

- **Production:** use [LiveKit Cloud](https://cloud.livekit.io) (a `wss://…livekit.cloud` URL + key/secret in `.env`) — never this dev config.
- The dev keys in `docker/livekit/livekit.yaml` are throwaway local-dev values and **must** match the repo-root `.env`.
- Full how-to: `docker/livekit/README.md`. Docker config context: `docker/CLAUDE.md`.
