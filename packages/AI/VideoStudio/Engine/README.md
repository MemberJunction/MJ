# @memberjunction/video-studio

`@memberjunction/video-studio` is the server-side engine and action package for MemberJunction Video Studio, housing `VideoRenderEngine` drivers, pre-production asset actions, and data snapshot actions. The brand-kit and archetype caches (`BrandKitEngine`, `VideoStudioEngine`) live in `@memberjunction/core-entities` so browser and server share them. It runs inside MJAPI with standard `contextUser` authorization and delegates all headless Chromium and FFmpeg composition rendering over the wire contract to `@memberjunction/video-studio-render-worker` rather than executing untrusted composition bundles in-process. See [plans/video-studio.md](../../../../plans/video-studio.md) for the full specification.

## Rendering (`VideoRenderEngine`)

`VideoRenderEngine` (`VideoRenderEngine.Instance.Driver`) is the process-wide singleton port (`BaseSingleton` + `IShutdownable`) that resolves and manages the active `VideoRenderDriverBase` implementation via `MJGlobal.Instance.ClassFactory`.

### `mj.config.cjs` Configuration

Add the optional `videoStudio.render` and `videoStudio.outputs` blocks to `mj.config.cjs` (omitted fields fall back to defaults; invalid values log a warning and fall back to defaults without throwing):

```javascript
module.exports = {
  // ...existing MJ configuration...
  videoStudio: {
    render: {
      // 'LocalWorker' (default) | 'Remote' (VS-RND-3) | 'Docker' (VS-RND-4)
      driver: 'LocalWorker',
      // Optional parallel HyperFrames capture workers per render, sent as RenderRequest.Workers.
      // Omit to let the worker choose (VIDEO_STUDIO_RENDER_WORKERS, else half its CPUs, 1-4; Docker: --cpus).
      // The worker clamps it to its CPU count and 8.
      // workers: 4,
      // Optional soundtrack settings sent with every render in RenderRequest.AudioMix (defaults shown).
      audio: {
        ducking: { enabled: true, duckDb: -7.5, attackMs: 80, releaseMs: 400 },   // music under narration
        loudness: { enabled: true, integratedLufs: -14, truePeakDb: -1.5, lra: 11 }, // final loudnorm target
        checks: {
          loudnessToleranceLu: 1.5,     // MJ_AUDIO_LOUDNESS
          minNarrationToMusicDb: 10,    // MJ_AUDIO_NARRATION_MASKED
          truePeakToleranceDb: 0.5,     // MJ_AUDIO_TRUE_PEAK
          minLinePauseSeconds: 0.15,    // MJ_AUDIO_LINE_PAUSE
          silenceThresholdDb: -45,
        },
      },
      // Maximum output payload size in bytes for MP4 downloads (/videos/<VideoID>) and image-carrying JSON responses (/stills, /contact-sheet, /keyframes, which also stop at buffer.constants.MAX_STRING_LENGTH even when maxOutputBytes is higher); non-image JSON responses (/health, /check), NDJSON lines, and error bodies are capped at 1 MiB (512 MiB default)
      maxOutputBytes: 536870912,
      timeouts: {
        startupMs: 60000,     // 60 s default
        renderMs: 2100000,    // 35 min default
        requestMs: 600000,    // 10 min default
      },
      local: {
        // Optional explicit path to @memberjunction/video-studio-render-worker dist/main.js
        // workerEntry: '/path/to/packages/AI/VideoStudio/RenderWorker/dist/main.js',
        // Optional V8 --max-old-space-size in MB for the spawned child process
        // maxOldSpaceMb: 4096,
      },
      remote: {
        // Single remote render worker HTTP/HTTPS URL (or env VIDEO_STUDIO_RENDER_URL)
        // url: 'https://render-worker.internal.example.com',
        // Or a pool of worker URLs (`urls` wins when both `url` and `urls` are set);
        // RemoteRenderDriver pins each job round-robin to one URL for both POST /render and GET /videos/<VideoID>,
        // and Health() probes every worker in the pool without advancing the job rotation.
        // urls: ['https://render-worker-1.internal.example.com', 'https://render-worker-2.internal.example.com'],
        // Bearer token sent in Authorization: Bearer <token> (or env VIDEO_STUDIO_RENDER_TOKEN)
        // token: process.env.VIDEO_STUDIO_RENDER_TOKEN,
      },
      docker: {
        // Docker image tag built from packages/AI/VideoStudio/RenderWorker/Dockerfile
        image: 'mj-video-render-worker:local',
        // Optional host workspace root directory bind-mounted into per-job containers
        // (when omitted, DockerRenderDriver creates and reuses a per-process 0o700 mkdtemp directory under os.tmpdir())
        // workspaceRoot: '/var/tmp/mj-video-render',
        cpus: 2,          // --cpus 2
        memoryMb: 4096,   // --memory 4096m
        pidsLimit: 512,   // --pids-limit 512
        shmSizeMb: 1024,  // --shm-size 1024m
      },
    },
    outputs: {
      // Max MP4 bytes allowed to fall back to InlineBase64 when no FileStorageAccount resolves or MJStorage fails
      // (default: 2097152 / 2 MB; set to 0 to disable InlineBase64 fallback).
      // VideoStudioAgent strips Output.Videos[*].InlineBase64 ('[inline-mp4]') from _CURRENT_PAYLOAD during the loop
      // and restores the real base64 bytes when the run exits (Delivered, G4 Plan, or Failed).
      // Intra-run intermediate files (narration clips, captions, poster, contact sheets) fall back to a bounded
      // in-process ephemeral store ('inline:<uuid>') when no FileStorageAccount is configured.
      inlineMaxBytes: 2097152,
    },
  },
};
```

### Render Drivers

| Driver (`videoStudio.render.driver`) | Description | Network Isolation (`Driver.IsNetworkIsolated`) |
| --- | --- | --- |
| `LocalWorker` *(default)* | Managed local child process (`LocalWorkerRenderDriver`). Spawns `@memberjunction/video-studio-render-worker` (`mj-video-render-worker`) on `127.0.0.1:0` with a sanitized environment allowlist (`BuildWorkerEnv` — never passes MJAPI database or vendor secrets) and a fresh 32-byte random bearer token per spawn. Cannot run as root (`uid === 0`): the worker refuses root unless `VIDEO_STUDIO_RENDER_ALLOW_ROOT=1` is set, and `BuildWorkerEnv` never forwards that variable. Requires **`ffmpeg`** on `PATH` and a **Chromium headless shell** (`pnpm --filter @memberjunction/video-studio-render-worker run browser:install` or `CHROME_PATH`); `@memberjunction/video-studio-render-worker` is declared in `optionalDependencies` of `@memberjunction/video-studio` so `npm install @memberjunction/video-studio` installs it by default for `LocalWorker`, while container builds targeting `Docker` or `Remote` can skip it with `--omit=optional`. | `false` — **Development / single-node trusted compositions only.** Logs a one-time startup warning (`LOCAL_WORKER_NETWORK_WARNING`) when selected. |
| `Remote` | Stateless HTTP/HTTPS client (`RemoteRenderDriver`) targeting one or more external render worker endpoints via `RenderWorkerHttpClient`. Configured via `videoStudio.render.remote.url` / `.urls` / `.token` (`urls` takes precedence when both `url` and `urls` are set; falls back to `VIDEO_STUDIO_RENDER_URL` / `VIDEO_STUDIO_RENDER_TOKEN` when neither is set; `mj.config.cjs` wins over env). `Health()` probes every worker in the pool without advancing the per-job rotation and reports `Healthy: true` only when all workers are healthy. Logs a one-time warning per distinct worker URL per driver instance if a plain `http://` URL targets a non-loopback host because the bundle's frozen data snapshot travels in the request body. | `false` — `RemoteRenderDriver.IsNetworkIsolated` is always `false` (`VideoRenderDriverBase.IsNetworkIsolated`). |
| `Docker` | Hardened one-container-per-job driver (`DockerRenderDriver`, Linux/macOS host only) provisioned via `@memberjunction/ai-agent-harness` (`DockerSandboxProvider`). Runs `node /app/dist/main.js run <op>` over a bind-mounted workspace with `--network none`, `--read-only`, `--tmpfs /tmp:rw,size=256m`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--cpus`, `--memory`, `--pids-limit`, and `--shm-size`, passing only `TMPDIR` and `HOME` in the process environment. Fails closed on Windows (`process.platform === 'win32'`) and directs operators to `Remote`. | `true` — **Required boundary for untrusted compositions (Decision 4 / D15).** |

### Running the `Docker` Driver (`DockerRenderDriver`)

Build the local render worker image from the repository root before using `driver: 'Docker'`:

```bash
docker build -f packages/AI/VideoStudio/RenderWorker/Dockerfile -t mj-video-render-worker:local .
```

- **Why `Docker` is the required boundary for untrusted compositions:** Model-written HTML/CSS/JS compositions generated from untrusted prompts cannot rely on the static lint gate alone: static pattern checks cannot stop obfuscated or dynamically constructed runtime JavaScript (`window['fet' + 'ch']`, WebRTC, dynamic DOM injection) from making outbound requests in headless Chromium, nor do they stop HyperFrames' own Node-side Google Fonts and GSAP CDN fetches during compilation and `check` runs. Running each operation inside a `--network none` container removes all non-loopback network interfaces at the kernel namespace level so neither Node nor Chromium can exfiltrate the bundle's `data.json` snapshot or reach external hosts.
- **One container per operation:** Every `Render`, `CaptureStills`, `BuildContactSheet`, `Check`, `ExtractKeyframes`, and `Health` call provisions a fresh container via `ISandboxProvider.Provision`, stages `request.json` and `out/` / `tmp/` / `home/` into `handle.HostWorkspacePath` (`chmod 0o700` on Linux; when `videoStudio.render.docker.workspaceRoot` is omitted, `DockerRenderDriver` creates and reuses a per-process `0o700` `mkdtemp` root under `os.tmpdir()`), runs `node /app/dist/main.js run <op> --request /workspace/request.json --out /workspace/out`, moves `out/` into a newly created `0o700` `<HostWorkspacePath>.out/out` directory outside the bind mount, verifies regular-file `O_NOFOLLOW` handles and output byte caps (`1 MiB` for non-image JSON outputs and `error.json`, `maxOutputBytes` for image-carrying JSON results (`stills`, `contact-sheet`, `keyframes`), and `maxOutputBytes` plus `VideoSizeBytes` equality for `video.mp4`) before reading, and in `finally` calls `ISandboxProvider.Finalize` first and removes `<HostWorkspacePath>.out` after `Finalize` when the container is no longer running.
- **Container hardening flags:** `DockerRenderDriver` passes `NetworkPolicy: 'none'` (`--network none`), `ReadOnlyRoot: true` (`--read-only --tmpfs /tmp:rw,size=256m`), `DropCapabilities: true` (`--cap-drop ALL --security-opt no-new-privileges`), `Cpus` (`--cpus 2`), `MemoryMb` (`--memory 4096m`), `PidsLimit` (`--pids-limit 512`), and `ShmSizeMb` (`--shm-size 1024m`). Only `TMPDIR=/workspace/tmp` and `HOME=/workspace/home` are passed into `Executor.Run` — parent process environment variables are never forwarded.
- **Host platform & `--user` behavior:** On Linux (`process.platform === 'linux'`), `DockerRenderDriver` passes `User: "${process.getuid()}:${process.getgid()}"` (`--user <uid:gid>`) so files written by the container into the bind-mounted host workspace are owned by the host user and removable by `Finalize`. On macOS (`process.platform === 'darwin'`, Docker Desktop VM), `User` is omitted (`undefined`) so the container runs as the image's default non-root `node` user (`1000:1000`), and Docker Desktop's VirtioFS/gRPC-FUSE mount translates host ownership automatically. On Windows (`process.platform === 'win32'`), `DockerRenderDriver` fails closed with `VideoRenderError('WorkerUnavailable')` before starting any container because Windows lacks `O_NOFOLLOW` symlink-safe host file reads; Windows hosts must use the `Remote` render driver instead.

### Running a Remote Worker Pool (`Remote` Driver)

Build the local image (`packages/AI/VideoStudio/RenderWorker/Dockerfile`, running as `USER node` UID `1000` and listening on `0.0.0.0:8080`) and run it with bearer token authentication and container hardening flags:

```bash
# Build from the repository root (mj-video-render-worker:local is built locally, not published to a public registry)
docker build -f packages/AI/VideoStudio/RenderWorker/Dockerfile -t mj-video-render-worker:local .

# Run with bearer token authentication and container hardening
docker run --rm -p 127.0.0.1:18080:8080 \
  -e VIDEO_STUDIO_RENDER_TOKEN="replace-with-strong-shared-secret" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=2g \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  mj-video-render-worker:local
```

- **Bearer token is the only credential:** The worker refuses to bind to a non-loopback address without `VIDEO_STUDIO_RENDER_TOKEN` and checks `Authorization: Bearer <token>` on every route (including `GET /health`). The worker never holds database, storage, or AI vendor credentials; that bearer token is the only credential the worker ever holds.
- **TLS termination:** Composition bundles include the frozen `data.json` snapshot. Terminate TLS at your ingress or reverse proxy and point `videoStudio.render.remote.url` / `videoStudio.render.remote.urls` (or `VIDEO_STUDIO_RENDER_URL`) at the `https://` endpoint(s). Plain `http://` to a non-loopback address is permitted for cluster-internal networks that terminate TLS at the mesh/ingress layer, and logs one warning per distinct worker URL per driver instance.
- **Ingress request body limit:** An ingress or reverse-proxy body limit applies before the worker's 256 MB cap (`VIDEO_STUDIO_RENDER_MAX_BODY_MB=256`). For example, nginx ingress defaults `client_max_body_size` to `1m`, so most composition bundles and keyframe payloads will fail with `413 BodyTooLarge` until the ingress body limit is raised to match `VIDEO_STUDIO_RENDER_MAX_BODY_MB`.
- **Response size caps (`maxOutputBytes` vs `1 MiB`):** `RenderWorkerHttpClient` (used by both `RemoteRenderDriver` and `LocalWorkerRenderDriver`) caps `/health`, `/check`, NDJSON stream lines on `/render`, and all non-2xx error response bodies at `1 MiB` (`1,048,576` bytes), while capping successful `2xx` image-carrying JSON response bodies (`/stills`, `/contact-sheet`, `/keyframes`) at `Math.min(maxOutputBytes, buffer.constants.MAX_STRING_LENGTH)` (so JSON bodies always stop at V8's string limit `buffer.constants.MAX_STRING_LENGTH`, `536,870,888` bytes on 64-bit Node, even when `maxOutputBytes` is higher) and streamed MP4 downloads (`/videos/<VideoID>`, additionally verified against any claimed `VideoSizeBytes`) at `videoStudio.render.maxOutputBytes` (`512 MiB` / `536,870,912` bytes default). Responses exceeding their cap abort the socket stream immediately and reject with `BodyTooLarge`.
- **Scaling & replica affinity:** Each worker runs one render job at a time by default (`VIDEO_STUDIO_RENDER_CONCURRENCY=1`) and keeps rendered MP4 bytes in memory inside that replica's ephemeral store until the immediate `GET /videos/<VideoID>` fetch completes. Both `POST /render` and `GET /videos/<VideoID>` for a job **must** reach the same worker replica (`RenderWorkerHttpClient` stores no cookies, so cookie stickiness and per-request load balancing lose the video with `NotFound`). The supported way to scale a pool is to list each worker replica URL in `videoStudio.render.remote.urls` (`urls` takes precedence if both `url` and `urls` are configured): `RemoteRenderDriver` selects one worker URL per job (round-robin) and pins both `POST /render` and `GET /videos/<VideoID>` to that same worker with no load balancer required, while `Health()` probes every worker in `urls` without advancing the job rotation and returns `Healthy: true` only when all workers are healthy. If you place a load balancer in front of multiple workers under a single `videoStudio.render.remote.url`, configure client-IP affinity (e.g., Kubernetes Service `sessionAffinity: ClientIP` or nginx `ip_hash`) so all requests from an MJAPI host reach the same replica.

## Audio (§8)

- **Soundtrack plan.** `BuildRenderAudioMix(spec, durationSeconds, settings.Audio)` turns `Audio` into the `RenderRequest.AudioMix` the worker mixes from: staged narration clips at their master-timeline starts, music (a licensed `Audio.Music.AssetKey`, else an opt-in `Audio.Music.Synthesized` bed) ducked under every line, `Sfx` cues (staged files or `Synth` kinds), and `MusicDuck` / `MusicSwell` events (`GainDb`, `DurationSeconds`). The render agent sends it with every render, fails the step on any audio check `Error` the worker returns (before the critic runs), and records each format's loudness, true peak, narration-to-music ratio, and synthesized sources in `Output.RenderMetadata.AudioByFormat`. Synthesized sources are also disclosed in `Review.HumanReviewNotes` and the critic's timeline.
- **Pronunciation.** Before TTS, every narration line goes through `NormalizeNarrationText` (`narration/pronunciation.ts`): built-in rewrites (upper-case dotted acronyms such as `A.I.` → `AI`, `e.g.`, `i.e.`, `vs.`, `&`) plus the brand kit voice's `PronunciationNotes`, one `Written => Spoken` rule per line (`->` and `→` also work; lines without an arrow are notes for humans). The text sent to TTS is stored as `NarrationLine.SpokenText`; captions keep `Text`, and word timings are mapped back onto the display words.
- **Pauses.** `NarrationLine.PauseBeforeSeconds` / `PauseAfterSeconds` (0 to 3 s) replace the default 0.3 s lead-in, 0.2 s gap, or 0.5 s tail on that side of the line (`ResolveBeatLinePauses`); two explicit sides of one gap add up. Unset, timing is unchanged.
- **Word-anchored visuals.** Every bundle stages `mj/narration-cues.js` (word timings) and loads it from the entry file. Compositions call `window.mjCue('<line key>', '<word or phrase>', nth?)` for the second the word is spoken. `CheckProductionRules` fails a literal call that names an unknown line or a word the line never says (`UnresolvedNarrationCue`).
