# `@memberjunction/video-studio-render-worker`

Stateless, sandboxed composition render worker for MemberJunction Video Studio. It accepts a `RenderProjectBundle` over HTTP (`RENDER_WORKER_ROUTES`), enforces a strict Content Security Policy (`COMPOSITION_CSP`) and static lint gate (`RunLintGate`), injects the deterministic `window.MJVideo` runtime preamble (`InjectPreambleIntoHtml`), and renders HTML/CSS/SVG/GSAP/Canvas compositions via HyperFrames (`@hyperframes/producer` + `@hyperframes/engine` + `@hyperframes/lint` pinned at `0.8.134`) and `ffmpeg`.

This package has **no** dependency on `@memberjunction/core`, `@memberjunction/core-entities`, or any database driver.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Probes HyperFrames, `ffmpeg`, `ffprobe`, and Chromium; returns `200` (`Healthy: true`) or `503` (`Healthy: false`). |
| `POST` | `/check` | Stages `Bundle` and runs the HyperFrames + MJ static lint gate without launching Chromium. |
| `POST` | `/render` | Validates, lints, injects the CSP + `window.MJVideo` preamble, renders an H.264/AAC MP4 (`yuv420p`, `+faststart`), streams `RenderStreamEvent` NDJSON lines, and stores the MP4 for one-shot retrieval at `/videos/<VideoID>`. |
| `GET` | `/videos/<VideoID>` | Streams a rendered MP4 (`video/mp4`) once and removes it from the ephemeral video store. |
| `POST` | `/stills` | Captures still frames (`png` or `jpeg`) across `Points` in a single Chromium session. |
| `POST` | `/contact-sheet` | Builds a contact sheet grid (and optional `TransitionStrip`) from captured stills in a single Chromium session. |
| `POST` | `/keyframes` | Extracts scene-change and uniform-sample keyframes from a base64 MP4 via `ffmpeg` / `ffprobe`. |

## Security Model

1. **Path Traversal Protection**: Every `Bundle.Files` and `Bundle.Assets` path is validated by `ValidateBundleRelativePath` before a single byte is written to disk. Absolute paths, `..` segments, backslashes, NUL/control bytes, and case-insensitive collisions return `400 InvalidBundle`.
2. **Pre-Render Lint Gate**: `RunLintGate` combines `@hyperframes/lint` with static checks across all authored HTML/CSS/JS/SVG files:
   - `MJ_NON_BUNDLE_URL` (`Error`, category `RemoteUrl`): Rejects `http:`, `https:`, `//`, `ws:`, `wss:`, `ftp:`, `file:`, and `javascript:` URLs in markup, CSS `url(...)` / `@import`, and JS strings, as well as relative paths escaping the bundle root. Only relative bundle paths, `#fragment`, `data:`, and `blob:` are permitted.
   - `MJ_NETWORK_API` (`Error`, category `RemoteUrl`): Rejects `fetch(...)`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `RTCPeerConnection`, `importScripts`, `serviceWorker`, `window.open`, location navigation, `<meta http-equiv="refresh">`, `<base>`, and `<link rel="prefetch|preconnect|dns-prefetch|prerender">`.
3. **Strict CSP**: `InjectPreambleIntoHtml` injects `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">` right after `<!doctype ...>` (or byte 0).
4. **Hardened Container**: Runs as UID/GID `10001:10001` with `HYPERFRAMES_FONT_CACHE_DIR=/tmp/hyperframes-fonts`, compatible with `--network=none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=2g --cap-drop=ALL --security-opt=no-new-privileges`.

## Local Development

```bash
# Install Chromium for local HyperFrames rendering (one-time)
cd packages/AI/VideoStudio/RenderWorker
pnpm run browser:install

# Build and run CI-safe unit tests
pnpm run build
pnpm test

# Run opt-in end-to-end Chromium + ffmpeg render tests
VIDEO_STUDIO_RENDER_TESTS=1 pnpm test

# Start the HTTP worker locally (prints VIDEO_STUDIO_RENDER_WORKER_PORT=<port> on stdout)
node dist/main.js
```

## Docker Build & Run

```bash
# Build from the repository root
docker build -f packages/AI/VideoStudio/RenderWorker/Dockerfile -t mj-video-render-worker:dev .

# Run with full container hardening
docker run --rm -p 8788:8788 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=2g \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  mj-video-render-worker:dev
```
