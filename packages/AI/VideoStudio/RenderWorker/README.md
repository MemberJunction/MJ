# `@memberjunction/video-studio-render-worker`

Stateless, sandboxed composition render worker for MemberJunction Video Studio. It accepts a `RenderProjectBundle` over HTTP (`RENDER_WORKER_ROUTES`), enforces a strict Content Security Policy (`COMPOSITION_CSP`) and static lint gate (`RunLintGate`), injects the deterministic `window.MJVideo` runtime preamble (`InjectPreambleIntoHtml`), runs deterministic quality checks (`RunCheckJob`), and renders HTML/CSS/SVG/GSAP/Canvas compositions via HyperFrames (`hyperframes`, `@hyperframes/producer`, `@hyperframes/engine`, `@hyperframes/lint` pinned at `0.8.134`) and `ffmpeg`.

This package has **no** dependency on `@memberjunction/core`, `@memberjunction/core-entities`, or any database driver.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Probes HyperFrames, `ffmpeg`, `ffprobe`, and Chromium; returns `200` (`Healthy: true`) or `503` (`Healthy: false`). |
| `POST` | `/check` | Runs the deterministic check pipeline: RND-1 security/lint gate → static authored-file checks → preamble + default fonts → `hyperframes check --json` CLI audit → in-page DOM text measurements (`SampleTimestampsSeconds ?? [0]`) and DOM rules. A lint-blocked bundle returns lint issues immediately without launching Chromium. |
| `POST` | `/render` | Validates, lints, injects the CSP + `window.MJVideo` preamble, renders an H.264/AAC MP4 (`yuv420p`, `+faststart`), streams `RenderStreamEvent` NDJSON lines, and stores the MP4 for one-shot retrieval at `/videos/<VideoID>`. |
| `GET` | `/videos/<VideoID>` | Streams a rendered MP4 (`video/mp4`) once and removes it from the ephemeral video store. |
| `POST` | `/stills` | Captures still frames (`png` or `jpeg`) across `Points` in a single Chromium session. |
| `POST` | `/contact-sheet` | Builds a contact sheet grid (and optional `TransitionStrip`) from captured stills in a single Chromium session. |
| `POST` | `/keyframes` | Extracts scene-change and uniform-sample keyframes from a base64 MP4 via `ffmpeg` / `ffprobe`. |

## Deterministic Check Pipeline (`RunCheckJob`)

`RunCheckJob` runs checks in order:
1. **Validate & Stage**: Validates bundle paths (`ValidateRenderBundle`) and frame geometry (`ValidateRenderGeometry`), then stages authored files without preamble injection.
2. **Lint Gate (`RunLintGate`)**: Runs `@hyperframes/lint` and static security scans (`MJ_NON_BUNDLE_URL`, `MJ_NETWORK_API`). If `BlockRender` is true, returns immediately without invoking Chromium.
3. **Static Checks (`RunStaticChecks`)**: Pure authored-file checks (`MJ_MISSING_ASSET`, `MJ_NONDETERMINISTIC_API`, `MJ_UNBOUND_LITERAL_SOURCE`).
4. **Preamble & Default Fonts (`ApplyPreambleToStagedBundle`)**: Stages bundled SIL OFL default fonts (`Inter` and `JetBrains Mono`, under `__mj_fonts/`) and injects `COMPOSITION_CSP`, `<style data-mj-default-fonts>`, and the `window.MJVideo` runtime preamble.
5. **HyperFrames CLI Audit (`backend.RunCheckCli` → `MapHyperFramesCheckOutput`)**: Runs `hyperframes check --json --no-proxy <dir>` in a locked-down subprocess (`env` reduced to `PATH`, `HOME`, `TMPDIR`, 2-minute timeout) and maps `layout`, `contrast`, and `motion` findings.
6. **DOM Measurement & Rules (`backend.MeasureText` → `EvaluateDomRules`)**: Seeks the composition at `SampleTimestampsSeconds ?? [0]` with bundle-only request interception, measures visible text nodes (including SVG `<text>`) via `BuildMeasureTextInPageScript`, and evaluates `MJ_SAFE_AREA`, `MJ_MIN_TEXT_SIZE`, `MJ_UNBOUND_LITERAL_RENDERED`, and `MJ_UNBUNDLED_FONT`.
7. **Merge, Dedupe & Sort (`DedupeCheckIssues`, `SortCheckIssues`)**: Deduplicates on `Code + Selector + File + Line` keeping the earliest `TimestampSeconds`, sorts deterministically, and sets `Passed = !Issues.some(i => i.Severity === 'Error')` and `BlockRender = !Passed`.

### Check Codes Reference

| Code | Category | Severity | Stage | Description |
| --- | --- | --- | --- | --- |
| `MJ_NON_BUNDLE_URL` | `RemoteUrl` | `Error` | Lint Gate | Relative path escaping the bundle root or non-bundle URL (`http:`, `https:`, `//`, `ws:`, `file:`, `javascript:`) in HTML, CSS, SVG, or JS. |
| `MJ_NETWORK_API` | `RemoteUrl` | `Error` | Lint Gate | Forbidden browser network/navigation API (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `RTCPeerConnection`, `importScripts`, `serviceWorker`, `window.open`, `location`, `<meta http-equiv="refresh">`, `<base>`, `<link rel="prefetch\|preconnect\|dns-prefetch\|prerender">`). |
| `MJ_MISSING_ASSET` | `MissingAsset` | `Error` | Static Checks | Bundle-relative reference in HTML, CSS, SVG, or JS that does not resolve to any entry in `Bundle.Files` or `Bundle.Assets`. |
| `MJ_NONDETERMINISTIC_API` | `Lint` | `Error` | Static Checks | Non-deterministic timer/clock API (`Date.now(`, `new Date()`, `performance.now(`, `requestAnimationFrame(`, `setTimeout(`, `setInterval(`) in composition scripts (skipping inline HTML `<script>` patterns already reported by `@hyperframes/lint` as `non_deterministic_code` or `requestanimationframe_in_composition`). |
| `MJ_UNBOUND_LITERAL_SOURCE` | `DataLiteral` | `Error` | Static Checks | Numeric literal token (`ExtractNumericLiteralTokens`) in authored HTML/SVG text outside `<script>`/`<style>` and outside `data-mj-bound` that is not in `AllowedDataLiterals`. |
| `MJ_SAFE_AREA` | `SafeArea` | `Error` | DOM Rules | Rendered text bounding box extends outside the format's safe-area insets (`SAFE_AREA_INSETS`). |
| `MJ_MIN_TEXT_SIZE` | `MinTextSize` | `Error` | DOM Rules | Rendered text `FontSizePx` is below `MIN_TEXT_SIZE_SHORT_EDGE_RATIO * Math.min(Width, Height)` (`27px` at `1080p`). |
| `MJ_UNBOUND_LITERAL_RENDERED` | `DataLiteral` | `Error` | DOM Rules | Rendered text outside `[data-mj-bound]` contains a numeric literal token not in `AllowedDataLiterals`. |
| `MJ_UNBUNDLED_FONT` | `Lint` | `Warning` | DOM Rules | Rendered text's primary computed `font-family` is neither a loaded `@font-face` in `document.fonts` nor one of the worker's bundled default fonts (`Inter`, `JetBrains Mono`). |
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

## Security Model

1. **Path Traversal Protection**: Every `Bundle.Files` and `Bundle.Assets` path is validated by `ValidateBundleRelativePath` before a single byte is written to disk. Absolute paths, `..` segments, backslashes, NUL/control bytes, and case-insensitive collisions return `400 InvalidBundle`.
2. **Pre-Render Lint Gate**: `RunLintGate` combines `@hyperframes/lint` with static checks across all authored HTML/CSS/JS/SVG files (`MJ_NON_BUNDLE_URL`, `MJ_NETWORK_API`).
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
