# Video Studio Guide

> **Status:** Part 1 covers the six infrastructure and invocation topics (`§6` Render drivers and the isolated worker, `§9` Brand kits and generation policy, and `§11` Invoking Video Studio) plus `§15` NOTICE. All other sections are one-line placeholders for Part 2.

---

## 1. What it is

*Part 2 placeholder — overview of code-rendered motion vs. generated footage and end-to-end production flow will be added in Part 2.*

---

## 2. Architecture

*Part 2 placeholder — workspace package map and stage sub-agent architecture will be added in Part 2.*

---

## 3. The `VideoGenerationSpec`

*Part 2 placeholder — `VideoGenerationSpec` schema, status lifecycle, and pure/async validators will be added in Part 2.*

---

## 4. Power levels

*Part 2 placeholder — power-level presets (`Draft`, `Standard`, `High`) and `VideoStudio.*` configuration parameters will be added in Part 2.*

---

## 5. Gates, critic, and the `Video Production Quality` rubric

*Part 2 placeholder — gates `G1`–`G6`, approval pauses, Critic repair loop, and the `Video Production Quality` rubric will be added in Part 2.*

---

## 6. Render drivers and the isolated worker

`VideoRenderEngine` ([`packages/AI/VideoStudio/Engine/src/render/video-render-engine.ts`](../packages/AI/VideoStudio/Engine/src/render/video-render-engine.ts)) resolves a `VideoRenderDriverBase` implementation via MJ `ClassFactory` using the `videoStudio.render.driver` key in `mj.config.cjs`. Settings are parsed and validated by `ReadVideoRenderSettings` ([`packages/AI/VideoStudio/Engine/src/render/render-settings.ts`](../packages/AI/VideoStudio/Engine/src/render/render-settings.ts)).

### `mj.config.cjs` settings (`videoStudio.render`)

```javascript
// mj.config.cjs
module.exports = {
  videoStudio: {
    render: {
      // 'LocalWorker' (default) | 'Remote' | 'Docker'
      driver: 'LocalWorker',

      // Maximum bytes accepted for a rendered MP4 (shared by Remote and Docker; default: 536870912 = 512 MiB)
      maxOutputBytes: 536870912,

      // Operation timeouts in milliseconds
      timeouts: {
        startupMs: 60000,    // LocalWorker startup + /health readiness (default: 60,000 ms)
        renderMs: 2100000,   // Full /render operation timeout (default: 2,100,000 ms = 35 min)
        requestMs: 600000,   // /stills, /contact-sheet, /check, /keyframes timeout (default: 600,000 ms = 10 min)
      },

      // Used when driver === 'LocalWorker'
      local: {
        // Optional absolute path to @memberjunction/video-studio-render-worker/dist/main.js
        workerEntry: undefined,
        // Optional V8 --max-old-space-size=<N> limit in MiB for the child process
        maxOldSpaceMb: undefined,
      },

      // Used when driver === 'Remote'
      remote: {
        // Single worker base URL (falls back to process.env.VIDEO_STUDIO_RENDER_URL)
        url: undefined,
        // Optional round-robin pool of worker base URLs; when both urls and url are set, urls wins
        urls: undefined,
        // Shared bearer token sent as Authorization: Bearer <token>
        // (falls back to process.env.VIDEO_STUDIO_RENDER_TOKEN)
        token: undefined,
      },

      // Used when driver === 'Docker'
      docker: {
        image: 'mj-video-render-worker:local', // Default image tag
        workspaceRoot: undefined,              // Optional host directory for per-operation mounts
        cpus: 2,                               // --cpus (default: 2)
        memoryMb: 4096,                        // --memory in MiB (default: 4096)
        pidsLimit: 512,                        // --pids-limit (default: 512)
        shmSizeMb: 1024,                       // --shm-size in MiB for Chromium /dev/shm (default: 1024)
      },
    },
  },
};
```

| Setting key | Type | Default | Source constant (`render-settings.ts`) |
|---|---|---|---|
| `videoStudio.render.driver` | `'LocalWorker' \| 'Remote' \| 'Docker'` | `'LocalWorker'` | `DEFAULT_VIDEO_RENDER_DRIVER` |
| `videoStudio.render.maxOutputBytes` | `number` | `536870912` (`512 MiB`) | `DEFAULT_RENDER_MAX_OUTPUT_BYTES` |
| `videoStudio.render.timeouts.startupMs` | `number` | `60000` (`60 s`) | `DEFAULT_RENDER_STARTUP_TIMEOUT_MS` |
| `videoStudio.render.timeouts.renderMs` | `number` | `2100000` (`35 min`) | `DEFAULT_RENDER_TIMEOUT_MS` |
| `videoStudio.render.timeouts.requestMs` | `number` | `600000` (`10 min`) | `DEFAULT_RENDER_REQUEST_TIMEOUT_MS` |
| `videoStudio.render.local.workerEntry` | `string \| undefined` | `undefined` (auto-resolved) | `ResolveWorkerEntryPath` (`local-worker-render-driver.ts`) |
| `videoStudio.render.local.maxOldSpaceMb` | `number \| undefined` | `undefined` | `BuildWorkerNodeArgs` (`local-worker-render-driver.ts`) |
| `videoStudio.render.remote.url` | `string \| undefined` | `process.env.VIDEO_STUDIO_RENDER_URL` | `ReadVideoRenderSettings` |
| `videoStudio.render.remote.urls` | `string[] \| undefined` | `undefined` (`urls` wins over `url`) | `ResolveRemoteWorkerUrls` |
| `videoStudio.render.remote.token` | `string \| undefined` | `process.env.VIDEO_STUDIO_RENDER_TOKEN` | `ReadVideoRenderSettings` |
| `videoStudio.render.docker.image` | `string` | `'mj-video-render-worker:local'` | `DEFAULT_DOCKER_RENDER_IMAGE` |
| `videoStudio.render.docker.workspaceRoot` | `string \| undefined` | `undefined` (process-wide `0o700` temp dir) | `ResolveWorkspaceRoot` (`docker-render-driver.ts`) |
| `videoStudio.render.docker.cpus` | `number` | `2` | `DEFAULT_DOCKER_CPUS` |
| `videoStudio.render.docker.memoryMb` | `number` | `4096` | `DEFAULT_DOCKER_MEMORY_MB` |
| `videoStudio.render.docker.pidsLimit` | `number` | `512` | `DEFAULT_DOCKER_PIDS_LIMIT` |
| `videoStudio.render.docker.shmSizeMb` | `number` | `1024` | `DEFAULT_DOCKER_SHM_SIZE_MB` |

### Driver comparison

| Driver | ClassFactory key & class | Isolation & lifecycle | When to use |
|---|---|---|---|
| **LocalWorker** | `'LocalWorker'` (`LocalWorkerRenderDriver` in [`local-worker-render-driver.ts`](../packages/AI/VideoStudio/Engine/src/render/local-worker-render-driver.ts)) | Spawns a local Node child process bound to `127.0.0.1:0` with a random 32-byte hex bearer token (`VIDEO_STUDIO_RENDER_TOKEN`) and a 12-key environment allowlist (`ALLOWED_WORKER_PARENT_ENV_KEYS`). Shares host network and filesystem permissions. | Local development and trusted compositions only. Logs `LOCAL_WORKER_NETWORK_WARNING` on startup. |
| **Remote** | `'Remote'` (`RemoteRenderDriver` in [`remote-render-driver.ts`](../packages/AI/VideoStudio/Engine/src/render/remote-render-driver.ts)) | Sends HTTP requests (`RenderWorkerHttpClient`) to one `url` or a round-robin `urls` pool of pre-running `mj-video-render-worker` servers. | Dedicated render worker fleet, Kubernetes deployments, or Windows hosts (where `DockerRenderDriver` is unsupported). |
| **Docker** | `'Docker'` (`DockerRenderDriver` in [`docker-render-driver.ts`](../packages/AI/VideoStudio/Engine/src/render/docker-render-driver.ts)) | Provisions a fresh container per operation via `DockerSandboxProvider` (`--network none`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`), runs `node /app/dist/main.js run <op>`, and stops/kills the container in `finally`. | **Recommended production boundary** for untrusted or LLM-authored compositions on Linux and macOS hosts. |

### `DockerRenderDriver` execution and the three host rules

Build the local worker image from the repository root (`DOCKER_RENDER_IMAGE_BUILD_COMMAND` in `docker-render-driver.ts`):

```bash
docker build -f packages/AI/VideoStudio/RenderWorker/Dockerfile -t mj-video-render-worker:local .
```

For each operation (`'render' | 'stills' | 'contact-sheet' | 'check' | 'keyframes'`), `DockerRenderDriver` calls `DockerSandboxProvider.Provision` ([`packages/AI/AgentHarness/src/sandbox/DockerSandboxProvider.ts`](../packages/AI/AgentHarness/src/sandbox/DockerSandboxProvider.ts)), which starts a detached container:

```text
docker run --detach --rm --name mj-harness-<RunId> \
  --volume <hostPath>:/workspace --workdir /workspace \
  --network none --cpus 2 --memory 4096m --pids-limit 512 --shm-size 1024m \
  --read-only --tmpfs /tmp:rw,size=256m \
  [--user <uid>:<gid> on Linux] \
  --cap-drop ALL --security-opt no-new-privileges \
  mj-video-render-worker:local sleep infinity
```

It then writes `request.json` into `<hostPath>`, creates `<hostPath>/out`, `<hostPath>/tmp`, and `<hostPath>/home`, and runs the one-shot CLI inside the container via `DockerExecExecutor.Run`:

```text
docker exec --interactive \
  --env TMPDIR=/workspace/tmp --env HOME=/workspace/home \
  mj-harness-<RunId> \
  node /app/dist/main.js run <op> --request /workspace/request.json --out /workspace/out
```

Operators must account for three host rules enforced by `DockerRenderDriver`:

1. **Host OS rules (Windows refused; Linux `--user <uid>:<gid>`; macOS image user):**
   - **Windows (`process.platform === 'win32'`) is refused:** `DockerRenderDriver` throws `VideoRenderError('WorkerUnavailable')` directing operators to use `'Remote'`, because Windows lacks `O_NOFOLLOW` symlink-safe host file reads.
   - **Linux (`process.platform === 'linux'`):** `resolveLinuxDockerUser()` passes `--user ${process.getuid()}:${process.getgid()}` and `chmod 0o700` on `hostRoot`, so files written inside `/workspace/out` are owned by the host MJAPI process user rather than `node` (UID `1000` in `RenderWorker/Dockerfile`).
   - **macOS (`process.platform === 'darwin'`):** `--user` is omitted so the container runs as `USER node` while Docker Desktop's file sharing translates ownership back to the host user.
2. **Workspace root and sibling-container volume mounts (`videoStudio.render.docker.workspaceRoot`):**
   - When `workspaceRoot` is omitted, `ResolveWorkspaceRoot` creates and reuses one process-wide `0o700` directory via `fs.mkdtemp(path.join(os.tmpdir(), 'mj-video-render-'))`, under which `DockerSandboxProvider` creates per-operation `mj-video-render-<RunId>` folders.
   - When MJAPI itself runs inside a Docker container and talks to the host's Docker daemon socket (sibling containers), `--volume <hostPath>:/workspace` is resolved by the **host daemon**, not inside the MJAPI container's overlay filesystem. Mount a shared host directory or named volume at the **exact same absolute path** on both the host and the MJAPI container and set `videoStudio.render.docker.workspaceRoot` to that path.
3. **Safe output move, `O_NOFOLLOW` reads, and `Finalize` teardown:**
   - Before reading any container output, `moveAndVerifySafeOutDir` creates a `0o700` `<hostRoot>.out` directory (`safeOutRoot`), renames `/workspace/out` to `<hostRoot>.out/out` (`safeOutDir`), and verifies via `fs.lstat` that it is a real directory (`!stat.isSymbolicLink() && stat.isDirectory()`).
   - Every output file (`response.json`, `events.ndjson`, `error.json`, `video.mp4`) is read via `readRegularFileNoFollow`, which checks `lstat` (`isFile()`, `!isSymbolicLink()`, `size <= maxBytes`) and opens the descriptor with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`.
   - On timeout or caller `AbortSignal`, the driver kills the `docker exec` child process (`proc.Kill()`). In `finally`, `provider.Finalize(handle, outcome)` runs `docker stop --time 5 mj-harness-<RunId>` (falling back to `docker kill mj-harness-<RunId>`) and removes `hostRoot`. The driver removes `<hostRoot>.out` **only** when `provider.IsContainerRunning(handle)` (`docker container inspect --format '{{.State.Running}}' mj-harness-<RunId>`) returns `false`, preventing cleanup races against a still-running container.

### `RemoteRenderDriver` transport security, routes, and size caps

`RemoteRenderDriver` (`packages/AI/VideoStudio/Engine/src/render/remote-render-driver.ts`) and `RenderWorkerHttpClient` (`packages/AI/VideoStudio/Engine/src/render/worker-http-client.ts`) communicate over the routes defined in `RENDER_WORKER_ROUTES` ([`packages/AI/VideoStudio/Core/src/render-contract.ts`](../packages/AI/VideoStudio/Core/src/render-contract.ts)):

- `GET /health` — Readiness probe returning `{ Status: 'ok', Version }`.
- `POST /render` — Streams `application/x-ndjson` (`progress` lines followed by a terminal `complete` or `error` line).
- `GET /videos/<videoId>` (`RENDER_WORKER_ROUTES.VideoPath(videoId)`) — Streams the rendered `video/mp4` binary once, then deletes it on the worker (or expires it after 5 minutes).
- `POST /stills`, `POST /contact-sheet`, `POST /check`, `POST /keyframes` — JSON request/response endpoints.

**Transport and authentication rules:**
- **Client side (`RemoteRenderDriver`):** Accepts `http://` and `https://` URLs. When a worker URL uses plain `http://` to a non-loopback host, `warnIfInsecureRemoteUrl` logs a one-time warning per distinct worker URL via `LogWarning`; TLS is not enforced by the client. `token` is optional on the client and, when set, is sent as `Authorization: Bearer <token>`.
- **Server side (`CreateRenderWorkerServer` in `packages/AI/VideoStudio/RenderWorker/src/server.ts`):** Refuses at startup to bind a non-loopback `VIDEO_STUDIO_RENDER_HOST` (such as `0.0.0.0` in Docker) unless `VIDEO_STUDIO_RENDER_TOKEN` is set to a non-empty secret, and requires `Authorization: Bearer <token>` (compared with `crypto.timingSafeEqual`) on every route whenever `VIDEO_STUDIO_RENDER_TOKEN` is set.

**Output size caps (enforced by both `RenderWorkerHttpClient` and `DockerRenderDriver`; response `Content-Length` is never trusted):**

| Stream / file | Cap | Source |
|---|---|---|
| `/health`, `/check`, and error JSON bodies (`error.json`), plus each `/render` NDJSON line (`events.ndjson`) | `1 MiB` (`1,048,576` bytes) | `MAX_RENDER_JSON_RESPONSE_BYTES` and `MAX_RENDER_NDJSON_LINE_BYTES` (`worker-http-client.ts`) |
| Rendered MP4 (`GET /videos/<videoId>` and `video.mp4`) | `videoStudio.render.maxOutputBytes` (default `536,870,912` bytes / `512 MiB`) + exact match against `completeEvent.Result.VideoSizeBytes` | `DEFAULT_RENDER_MAX_OUTPUT_BYTES` (`render-settings.ts`) |
| Base64 image-carrying JSON responses (`/stills`, `/contact-sheet`, `/keyframes`, and `response.json` in Docker) | `Math.min(maxOutputBytes, buffer.constants.MAX_STRING_LENGTH)` | `RenderWorkerHttpClient.postJson` (`worker-http-client.ts`) and `DockerRenderDriver.runOneShotOperation` (`docker-render-driver.ts`) |

### Security boundary and isolated worker defenses

> [!IMPORTANT]
> **Static checks are not the data-leak boundary — `DockerRenderDriver` (`--network none`) is.**
> Compositions require inline scripts (`script-src 'self' 'unsafe-inline'`), so `RunLintGate` (`packages/AI/VideoStudio/RenderWorker/src/lint-gate.ts`) cannot prevent obfuscated inline JS (`self["loc"+"ation"]`) or dynamically constructed `<script>` elements at runtime. In addition, `@hyperframes/producer` and `hyperframes check` make Node-side outbound `fetch()` requests (for example to `https://fonts.googleapis.com` and `https://cdnjs.cloudflare.com` for GSAP) outside Chromium, and `@hyperframes/engine` launches `chrome-headless-shell` with `--no-sandbox`. Always use `DockerRenderDriver` (`--network none`) or an egress-firewalled `Remote` worker for untrusted or LLM-authored compositions; use `LocalWorkerRenderDriver` only for trusted local development.

For the full defense-in-depth walkthrough, see [`packages/AI/VideoStudio/RenderWorker/README.md`](../packages/AI/VideoStudio/RenderWorker/README.md#security-model--defense-in-depth). Key worker facts:

- **Parent environment scrubbing (`BuildWorkerEnv` in `local-worker-render-driver.ts`):** Copies only the 12-key `ALLOWED_WORKER_PARENT_ENV_KEYS` allowlist (`PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `LANG`, `LC_ALL`, `SystemRoot`, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_CACHE_DIR`, `HYPERFRAMES_BROWSER_PATH`) plus `VIDEO_STUDIO_RENDER_HOST=127.0.0.1`, `VIDEO_STUDIO_RENDER_PORT=0`, and `VIDEO_STUDIO_RENDER_TOKEN=<token>`. Because `VIDEO_STUDIO_RENDER_ALLOW_ROOT` is not in the allowlist, `LocalWorkerRenderDriver` cannot spawn a worker when the parent process runs as `uid === 0` (`AssertNotRunningAsRoot` in `RenderWorker/src/root-guard.ts` refuses `uid === 0` unless `VIDEO_STUDIO_RENDER_ALLOW_ROOT=1` is present in the worker environment).
- **Bundle staging (`StageCompositionBundle` in `RenderWorker/src/bundle.ts`):** Stages files into a `0o700` directory created with `fs.mkdtemp(path.join(parent, 'mj-video-bundle-'))`. `ValidateBundleRelativePath` rejects empty paths, null bytes, backslashes, leading `/`, Windows drive prefixes, and `.` / `..` segments before writing files with `O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW`.
- **Static URL scheme gate (`MJ_NON_BUNDLE_URL` in `RenderWorker/src/lint-gate.ts`):** Rejects every URL scheme in HTML attributes and CSS `url(...)` except `data:` and `blob:`.
- **Injected preamble and CSP (`InjectPreambleIntoHtml` in `RenderWorker/src/preamble.ts`):** Injects `<meta http-equiv="Content-Security-Policy" content="...">` immediately after `<!doctype ...>` (or at byte 0) with `COMPOSITION_CSP`:
  ```text
  default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
  ```
- **HyperFrames CLI flags (`RenderWorker/src/hyperframes-backend.ts`):** Invokes `hyperframes check --json --no-proxy --no-browser-gpu <bundleDir>`.
- **Runtime and container image (`RenderWorker/package.json` and `RenderWorker/Dockerfile`):** Requires Node `>=22.0.0`; the Dockerfile sets `DO_NOT_TRACK=1`, `HYPERFRAMES_NO_TELEMETRY=1`, `VIDEO_STUDIO_RENDER_HOST=0.0.0.0`, `VIDEO_STUDIO_RENDER_PORT=8080`, runs as `USER node` (UID `1000`), `EXPOSE 8080`, and uses `CMD ["node", "/app/dist/main.js"]`.

---

## 7. File storage setup

*Part 2 placeholder — `Content Creation` category `DefaultStorageAccountID` setup and `StoreFile` / `ReadFile` behavior will be added in Part 2.*

---

## 8. Data stories

*Part 2 placeholder — `DataBindings`, `CaptureDataSnapshot`, `MJChartKit`, and `VerifyDataBindingDom` will be added in Part 2.*

---

## 9. Brand kits and generation policy

Organization brand identity and generative AI guardrails are stored in `MJ: Brand Kits` (`MJBrandKitEntity`) and `MJ: Brand Kit Assets` (`MJBrandKitAssetEntity`), created by [`migrations/v6/V202610161600__v6.2.x__Brand_Kits_And_Video_Archetypes.sql`](../migrations/v6/V202610161600__v6.2.x__Brand_Kits_And_Video_Archetypes.sql).

### `BrandKitEngine` and `VideoStudioEngine` (`@memberjunction/core-entities`)

Both metadata cache engines live in `@memberjunction/core-entities`:

- **`BrandKitEngine`** ([`packages/MJCoreEntities/src/engines/BrandKitEngine.ts`](../packages/MJCoreEntities/src/engines/BrandKitEngine.ts)) — Caches `MJ: Brand Kits` and `MJ: Brand Kit Assets`.
  - `GetKitsForCompany(companyId: string | null)`: Returns `Active` kits matching `companyId` plus org-wide (`CompanyID == null`) `Active` kits, ordered with company-specific kits before org-wide kits, `IsDefault` kits first within each tier, then by `Name`.
  - `GetDefaultKit(companyId: string | null)`: Returns the `Active` default kit (`IsDefault === true`) for `companyId`, falling back to the org-wide (`CompanyID == null`) `Active` default kit, or `null` when none exists.
  - `GetAssets(brandKitId: string, assetType?: BrandKitAssetType)`: Returns cached `MJBrandKitAssetEntity` rows for `brandKitId` (optionally filtered by `AssetType`).
  - `GetGenerationReferenceAssets(brandKitId: string)`: Returns cached assets for `brandKitId` where `IsGenerationReference === true`.
  - `GetEffectiveGenerationPolicy(kit: MJBrandKitEntity | null)`: Parses `kit.GenerationPolicy` into a `BrandGenerationPolicy` object (`{ AllowGeneratedImages, AllowGeneratedVideo, AllowSyntheticPeople, StylePrompt?, AvoidSubjects, MaxGenerationCostPerRun? }`).
- **`VideoStudioEngine`** ([`packages/MJCoreEntities/src/engines/VideoStudioEngine.ts`](../packages/MJCoreEntities/src/engines/VideoStudioEngine.ts)) — Caches `MJ: Video Archetypes` (`GetArchetypesForCompany(companyId)`, `GetArchetypeByName(name, companyId)`) and ensures `BrandKitEngine.Instance` is configured alongside it.

### Default-uniqueness and asset reference invariants

1. **One default kit per `CompanyID` scope (`MJBrandKitEntityServer.ValidateAsync` in [`packages/MJCoreEntitiesServer/src/custom/MJBrandKitEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJBrandKitEntityServer.server.ts)):**
   - When `IsDefault` is `true`, `ValidateAsync` runs a `RunView` over `MJ: Brand Kits` in the same `CompanyID` scope (`CompanyID = '<id>'` when set, or `CompanyID IS NULL` for org-wide kits, regardless of `Status`, excluding the current `ID` on update) and adds a validation error on `IsDefault` if another default kit already exists in that scope.
2. **Visual-only generation references (`CK_BrandKitAsset_GenerationReference` in `V202610161600__v6.2.x__Brand_Kits_And_Video_Archetypes.sql`):**
   - `BrandKitAsset` enforces `IsGenerationReference = 0 OR AssetType IN (N'Image', N'Screenshot', N'Logo', N'LogoMark', N'Video')` so non-visual assets (`Font`, `Audio`, `Music`, `SoundEffect`) cannot be flagged as visual generation references.

### `GenerationPolicy` defaults and fail-closed parsing

`BrandKitEngine.GetEffectiveGenerationPolicy(kit)` applies two safety rules:

- **Null kit or blank `GenerationPolicy`:** Returns a copy of `DEFAULT_BRAND_GENERATION_POLICY`:
  ```json
  {
    "AllowGeneratedImages": true,
    "AllowGeneratedVideo": true,
    "AllowSyntheticPeople": false,
    "AvoidSubjects": []
  }
  ```
- **Malformed JSON or non-object `GenerationPolicy`:** Logs an error via `LogError` and **fails closed** with all three booleans set to `false`:
  ```json
  {
    "AllowGeneratedImages": false,
    "AllowGeneratedVideo": false,
    "AllowSyntheticPeople": false,
    "AvoidSubjects": []
  }
  ```

### Shipped sample brand kit (`metadata/brand-kits/.brand-kits.json`)

MemberJunction ships one sample brand kit in [`metadata/brand-kits/.brand-kits.json`](../metadata/brand-kits/.brand-kits.json):

- **`Name`:** `"MemberJunction"` (`ID: "DBBE8BC2-8FEF-4DA9-B24A-C6038129B696"`, `Status: "Active"`, `IsDefault: false`, `CompanyID: null`).
- **`GenerationPolicy`:**
  ```json
  {
    "AllowGeneratedImages": true,
    "AllowGeneratedVideo": true,
    "AllowSyntheticPeople": false,
    "StylePrompt": "flat illustration in the brand palette, no text, no logos",
    "AvoidSubjects": ["people", "faces", "logos", "on-screen text", "product screens"]
  }
  ```
- **`NeverInvent`:** `["product screens", "the MemberJunction logo", "metrics or statistics", "customer or member names", "quotes or testimonials"]`.

### Angular Brand Kit form panels

The `MJ: Brand Kits` entity form is extended with two `after-fields` form panels in `packages/Angular/Explorer/core-entity-forms/src/lib/panels/brand-kits/` that wrap the reusable editors from `@memberjunction/ng-brand-kits` (`packages/Angular/Generic/brand-kits`):

| Panel component | `@RegisterFormPanel` key | `sortKey` | Wrapped editor selector |
|---|---|---|---|
| `BrandKitAssetsPanelComponent` ([`brand-kit-assets.panel.ts`](../packages/Angular/Explorer/core-entity-forms/src/lib/panels/brand-kits/brand-kit-assets.panel.ts)) | `'MJBrandKitAssetsPanel'` | `20` | `<mj-brand-kit-assets-editor>` |
| `BrandKitGenerationPolicyPanelComponent` ([`brand-kit-generation-policy.panel.ts`](../packages/Angular/Explorer/core-entity-forms/src/lib/panels/brand-kits/brand-kit-generation-policy.panel.ts)) | `'MJBrandKitGenerationPolicyPanel'` | `30` | `<mj-brand-kit-generation-policy-editor>` |

---

## 10. Generated footage

*Part 2 placeholder — `AIVideoRunner`, `FLUX 3 Video` / `FLUX 3 Image`, C2PA inspection, and generation cost accounting will be added in Part 2.*

---

## 11. Invoking Video Studio

The root `Video Studio` agent (`ID: 00151C2D-3284-4F43-973E-947A7222DC24`, `TypeID: Loop`, `DriverClass: VideoStudioAgent`, `InvocationMode: Any`, `ExposeAsAction: true`, `ChatHandlingOption: Consult` in [`metadata/agents/.video-studio-agent.json`](../metadata/agents/.video-studio-agent.json)) orchestrates seven direct child Loop sub-agents (`ParentID = 00151C2D-3284-4F43-973E-947A7222DC24`, all with `InvocationMode: 'Sub-Agent'`):

1. `Video Studio - Director` (`ExecutionOrder: 1`)
2. `Video Studio - Art Director` (`ExecutionOrder: 2`)
3. `Video Studio - Storyboard` (`ExecutionOrder: 3`)
4. `Video Studio - Pre-Production` (`ExecutionOrder: 4`)
5. `Video Studio - Motion Engineer` (`ExecutionOrder: 5`)
6. `Video Studio - Render` (`ExecutionOrder: 6`)
7. `Video Studio - Critic` (`ExecutionOrder: 7`)

### 1. Sage peer-to-peer hand-off (`nextStep.type = 'Handoff'`)

When a user asks Sage in chat to make a video, product film, social clip, or animated KPI briefing, Sage discovers and transfers the conversation to `Video Studio` (for the full client/server hand-off contract, see [Handing a conversation to another agent](CONVERSATIONS_UX_STACK_GUIDE.md#handing-a-conversation-to-another-agent)):

1. **Semantic discovery (`AI Agents Search` + `IsDirectlyDiscoverable`):**
   - The `AI Agents Search` EntityDocument (`ID: DA9AD383-A4DC-4C0C-93A8-EAC99C75054B` in [`metadata/entity-documents/.entity-documents.json`](../metadata/entity-documents/.entity-documents.json)) is `Status: 'Active'`, indexing `MJ: AI Agents` for `FindCandidateAgentsAction` ([`packages/Actions/CoreActions/src/custom/ai/find-candidate-agents.action.ts`](../packages/Actions/CoreActions/src/custom/ai/find-candidate-agents.action.ts)) and `FindBestAgentAction` ([`packages/Actions/CoreActions/src/custom/ai/find-best-agent.action.ts`](../packages/Actions/CoreActions/src/custom/ai/find-best-agent.action.ts)).
   - Both actions and `ResolveHandoffTarget` ([`packages/AI/Agents/src/handoff-target.ts`](../packages/AI/Agents/src/handoff-target.ts)) filter candidates with `AIAgentPermissionHelper.IsDirectlyDiscoverable(agent)` ([`packages/AI/BaseAIEngine/src/AIAgentPermissionHelper.ts`](../packages/AI/BaseAIEngine/src/AIAgentPermissionHelper.ts)), which requires `agent.InvocationMode !== 'Sub-Agent' && !agent.ParentID`. Only the root `Video Studio` agent passes; all seven stage children are hidden from direct discovery and refused with `NotDiscoverable` if targeted.
2. **Top-level transfer (`AgentRunner.FollowHandoffs`):**
   - Sage (`metadata/prompts/templates/sage/sage.template.md`) emits `nextStep.type = 'Handoff'` with `handoff: { agentName: "Video Studio", brief, reason }` and `taskComplete: false`.
   - `AgentRunner.FollowHandoffs` ([`packages/AI/Agents/src/AgentRunner.ts`](../packages/AI/Agents/src/AgentRunner.ts)) records a completed `Handoff` step on the source run (`TargetID`, `HandoffToAgentID`, `TargetConversationDetailID`), creates a new `MJ: Conversation Details` row for `Video Studio` (`ParentID` = source detail row, `Role = 'AI'`), and executes `Video Studio` as a root run (`ParentRunID IS NULL`) on the same `ConversationID`. Subsequent user turns in that conversation route directly to `Video Studio`.
3. **Target preset resolution (`ResolveConversationAgentPreset`):**
   - Handoff drops the source agent's `ConfigurationID`. `ResolveConversationAgentPreset` ([`packages/AI/BaseAIEngine/src/agent-preset-resolution.ts`](../packages/AI/BaseAIEngine/src/agent-preset-resolution.ts)) resolves `Video Studio`'s preset by checking `@mention` pins on the active branch path, then the user's saved `MJ: User Settings` preference at `AgentModeSettingKey('00151C2D-3284-4F43-973E-947A7222DC24')` (`mj.agentMode.00151c2d-3284-4f43-973e-947a7222dc24`), and falling back to its default preset `Standard` (`AIConfigurationID: 2144CA24-5FD1-4C07-A4F5-FF0685DE32A1`).
   - This end-to-end flow is verified without live LLM calls by `IT150` (`video-studio-handoff` check bundle `VSH1`–`VSH3` in [`packages/TestingFramework/integration-test-suite/src/checks/video-studio-handoff.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/video-studio-handoff.checks.ts): `VSH1` direct discoverability and real top-level transfer, `VSH2` target preset resolution, and `VSH3` the continuity `ConversationDetail` row).

### 2. Direct `@Video Studio` mention and preset selection

Users can invoke `@Video Studio` directly from the conversation composer and pick one of the three `MJ: AI Agent Configurations` presets seeded in `metadata/agents/.video-studio-agent.json` (backed by [`metadata/ai-configurations/.video-studio-configurations.json`](../metadata/ai-configurations/.video-studio-configurations.json)):

| Preset Name | `MJ: AI Agent Configurations.ID` | `AIConfigurationID` (`MJ: AI Configurations.ID`) | `IsDefault` |
|---|---|---|---|
| `Draft` | `79257776-F45E-44B1-9E50-4F1E399E7B48` | `6791A2B6-B58F-4E40-8EEB-5A2F624DBD45` (`Video Studio Draft`) | `false` |
| `Standard` | `CB675CDA-0C50-43B8-A709-2782C597EF36` | `2144CA24-5FD1-4C07-A4F5-FF0685DE32A1` (`Video Studio Standard`) | `true` |
| `High` | `2EA8CBC6-17AA-4819-849B-97E8793D4AEB` | `5F7A39BE-9726-429B-AD55-67B8709485CF` (`Video Studio High`) | `false` |

### 3. Specialist agent consultation (`Query Builder` and `Research Report Writer`)

`metadata/agents/.video-studio-agent.json` defines two `MJ: AI Agent Relationships` rows where specialist agents invoke `Video Studio` as a related sub-agent with `ChatHandlingOption: "Consult"` and `ConfigurationPresetID` set to `Standard`:

| Parent Agent | Relationship `ID` | `SubAgentInputMapping` | `SubAgentContextPaths` | `SubAgentOutputMapping` |
|---|---|---|---|---|
| `Query Builder` | `8833E6C6-17B4-468A-BC74-70C145FF4BB9` | `{ "rows": "DataSnapshot.Inline.caller.rows", "columns": "DataSnapshot.Inline.caller.columns" }` | `["title", "interpretation", "savedQueryId", "savedQueryName", "metadata.sql"]` | `{ "Status": "video.Status", "Film.OneSentence": "video.OneSentence", "Output.Videos": "video.Videos", "Output.PosterFileID": "video.PosterFileID", "Review.HumanReviewNotes": "video.HumanReviewNotes" }` |
| `Research Report Writer` | `39DD52B1-9707-473B-AC7D-8EEBA1F3F37A` | *(none)* | `["synthesis", "report", "sources"]` | `{ "Status": "video.Status", "Film.OneSentence": "video.OneSentence", "Output.Videos": "video.Videos", "Output.PosterFileID": "video.PosterFileID", "Review.HumanReviewNotes": "video.HumanReviewNotes" }` |

When `Query Builder` calls `Video Studio`, `SubAgentInputMapping` populates `DataSnapshot.Inline.caller.{rows,columns}` on the seeded `VideoGenerationSpec`, and `Video Studio - Director` (`metadata/prompts/templates/video-studio/director.template.md`) either binds `Source.Kind: 'Inline'` with key `'caller'` or prefers `Source.Kind: 'Query'` with `savedQueryId` when present in `SubAgentContextPaths`.

### 4. The `Produce Video` action (`ProduceVideoAction`) and MCP tools

Workflows (`Flow` agents), task graphs, MCP clients, and server code can invoke `Video Studio` through the **`Produce Video`** action (`@RegisterClass(BaseAction, 'Produce Video')`, `PRODUCE_VIDEO_DRIVER_CLASS = 'Produce Video'` in [`packages/AI/VideoStudio/Engine/src/actions/produce-video.action.ts`](../packages/AI/VideoStudio/Engine/src/actions/produce-video.action.ts) and [`packages/AI/VideoStudio/Engine/src/actions/produce-video.mapping.ts`](../packages/AI/VideoStudio/Engine/src/actions/produce-video.mapping.ts), seeded in [`metadata/actions/video-studio/.video-studio-actions.json`](../metadata/actions/video-studio/.video-studio-actions.json)). When exposed through `@memberjunction/ai-mcp-server` ([`packages/AI/MCPServer/src/Server.ts`](../packages/AI/MCPServer/src/Server.ts)), MCP tool names are configuration-driven: `Execute_Produce_Video_Action` for the action (`Server.ts:1769`) and `Execute_Video_Studio_Agent` or `Run_Agent` for direct agent execution (`Server.ts:1859`, `:2777`).

#### Input parameters (`ProduceVideoInput`)

| Parameter | Required | Type | Behavior (`BuildProduceVideoRequest` in `produce-video.mapping.ts`) |
|---|---|---|---|
| `Topic` | Yes | `string` | Non-empty topic/brief string; used as the initial user message and seeds `Film.Topic` and `Film.WorkingTitle`. Always sets `Interaction.Mode: 'Autonomous'` on the seeded spec. |
| `Archetype` | No | `string` | Archetype `Name` or `ID` (UUID), resolved via `VideoStudioEngine.Instance` in `CompanyID` scope. When omitted, `Archetype` is left unset on the seeded spec; unknown or out-of-scope values fail with `NOT_FOUND`. |
| `BrandKit` | No | `string` | Brand kit `Name` or `ID` (UUID), resolved via `BrandKitEngine.Instance.GetKitsForCompany` / `BrandKits` in `CompanyID` scope. When omitted, defaults to `BrandKitEngine.Instance.GetDefaultKit(companyId ?? null)`; unknown or out-of-scope values fail with `NOT_FOUND`. |
| `Formats` | No | `VideoFormat[] \| string` | Array, JSON array string, or comma-separated list of `'16:9' \| '9:16' \| '1:1'`. Defaults to the resolved archetype's `DefaultFormats`, or `['16:9']` when no archetype is specified. |
| `DurationSeconds` | No | `number` | Positive duration in seconds. When an archetype is set, must fall within `MinDurationSeconds`..`MaxDurationSeconds`; when omitted, defaults to `archetype.DefaultDurationSeconds` if positive, else `undefined`. |
| `CompanyID` | No | `string` | UUID validated via `IsValidUUID`. Scopes archetype and brand kit resolution and is forwarded as `companyId` on `AgentRunner.RunAgent` and `CompanyID` on `VideoGenerationSpec`. |
| `PowerLevel` | No | `'Draft' \| 'Standard' \| 'High'` | Preset name resolved via `AIEngine.Instance.FindActiveAgentConfigurationPreset` (or `GetDefaultAgentConfigurationPreset` when omitted) to pass `configurationId` (`AIConfigurationID`) to `RunAgent`. |
| `DataRefs` | No | `ProduceVideoDataRefInput[] \| string` | Array or JSON array string of `{ Key, Kind: 'Query' \| 'View' \| 'Artifact', QueryID?, QueryName?, Parameters?, EntityName?, ExtraFilter?, Fields?, ArtifactVersionID?, Shape: 'SingleValue' \| 'Comparison' \| 'Series' \| 'Table', Format?: { Kind, Currency?, Decimals?, Prefix?, Suffix? }, Label? }` (`Key` and `Shape` required). Seeded into `DataBindings`; `'Inline'` and duplicate `Key` values fail with `INVALID_PARAMS`. |

#### Result codes and output parameters

| `ResultCode` | `Success` | When returned | Output parameters appended to `Params` |
|---|---|---|---|
| `SUCCESS` | `true` | `runResult.success === true`. Calls `runner.ProcessAgentArtifacts` before returning. | `AgentRunID`, `ArtifactID`, `ArtifactVersionID`, `Status` (`spec?.Status`), `VideoFileIDs` (`Record<string, string>` from `spec?.Output?.Videos`), `PosterFileID` (`spec?.Output?.PosterFileID`), `HumanReviewNotes` (`spec?.Review?.HumanReviewNotes`) |
| `NEEDS_INPUT` | `false` | `runResult.agentRun?.FinalStep === 'Chat'` | `AgentRunID` |
| `RUN_FAILED` | `false` | `!runResult.success` (and `FinalStep !== 'Chat'`) | `AgentRunID`, plus `Status` and `HumanReviewNotes` when present on `finalPayload` |
| `INVALID_PARAMS` | `false` | Parameter validation failure in `BuildProduceVideoRequest` | *(none)* |
| `NOT_FOUND` | `false` | `'Video Studio'` agent missing, or `Archetype` / `BrandKit` not found in `CompanyID` scope | *(none)* |
| `UNEXPECTED_ERROR` | `false` | Unhandled exception during execution | *(none)* |

### 5. Scheduled recurring productions (`AgentScheduledJobDriver`)

`AgentScheduledJobDriver` ([`packages/Scheduling/engine/src/drivers/AgentScheduledJobDriver.ts`](../packages/Scheduling/engine/src/drivers/AgentScheduledJobDriver.ts)) validates `ConfigurationID`, `CompanyID`, `ConversationID`, and `OverrideModelID` in `AgentJobConfiguration` ([`packages/Scheduling/base-types/src/types.ts`](../packages/Scheduling/base-types/src/types.ts)) with `IsValidUUID` and forwards them to `AgentRunner.RunAgent` as `configurationId`, `companyId`, `conversationId`, and `override: { modelId }`.

Example `ScheduledJob.Configuration` JSON for a recurring Monthly KPI Briefing (using the `Video Studio` `AgentID` and `Video Studio Standard` `ConfigurationID`, adapted from `VS-INV-4`):

```json
{
  "AgentID": "00151C2D-3284-4F43-973E-947A7222DC24",
  "ConfigurationID": "2144CA24-5FD1-4C07-A4F5-FF0685DE32A1",
  "CompanyID": "33333333-3333-4333-8333-333333333333",
  "ConversationID": "11111111-1111-4111-8111-111111111111",
  "InitialMessage": "Produce the monthly KPI briefing video for the most recently closed month using our brand kit.",
  "StartingPayload": {
    "InteractionMode": "Autonomous",
    "Film": {
      "Topic": "Monthly KPI Briefing",
      "DurationSeconds": 60,
      "Formats": ["16:9"]
    }
  }
}
```

### 6. Production cycle guard

A `Video Studio` production cannot recursively start another `Video Studio` production:

- **In-process hierarchy check (`VideoStudioAgent.validateAgent` in [`packages/AI/VideoStudio/Engine/src/agents/video-studio-agent.ts`](../packages/AI/VideoStudio/Engine/src/agents/video-studio-agent.ts)):** Inspects `this.AgentHierarchy.slice(0, -1)` case-insensitively before running. If `'Video Studio'` is already present in the ancestor chain, it fails the run immediately with:
  ```text
  Video Studio is already running higher in this call chain (<chain>). A production cannot start another production.
  ```
- **Task-graph ancestor reconstruction (`TaskGraphAgentRunner.buildParentAgentHierarchy` in [`packages/MJServer/src/services/TaskGraphAgentRunner.ts`](../packages/MJServer/src/services/TaskGraphAgentRunner.ts)):** When a task-graph node invokes an agent, `TaskGraphAgentRunner` walks `ParentRunID` up to `MAX_ANCESTOR_HOPS = 25` hops via `RunView` to reconstruct `parentAgentHierarchy` and passes it to `AgentRunner.RunAgent`, ensuring `VideoStudioAgent.validateAgent` also catches indirect `Video Studio → task graph → Video Studio` cycles.

---

## 12. The Video Studio app

*Part 2 placeholder — Explorer `Video Studio` application (`Productions`, `Brand Kits`, `Archetypes`), `<mj-media-player>`, and artifact viewer plugins will be added in Part 2.*

---

## 13. Testing

*Part 2 placeholder — unit test suites, `VIDEO_STUDIO_RENDER_TESTS=1`, and deterministic/live integration check bundles will be added in Part 2.*

---

## 14. Troubleshooting

*Part 2 placeholder — operational troubleshooting table will be added in Part 2.*

---

## 15. NOTICE

Video Studio includes or depends on the following third-party open-source components:

- **HyperFrames** (`@hyperframes/producer`, `@hyperframes/engine`, `@hyperframes/lint`, and `hyperframes` CLI, pinned at `0.8.134`) — Copyright HeyGen, licensed under the **Apache License, Version 2.0** ([https://github.com/heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)).
- **Inter** (bundled as `MJ Sans` in `packages/AI/VideoStudio/RenderWorker/assets/fonts/`) — Copyright The Inter Project Authors (Rasmus Andersson), licensed under the **SIL Open Font License, Version 1.1**.
- **JetBrains Mono** (bundled as `MJ Mono` in `packages/AI/VideoStudio/RenderWorker/assets/fonts/`) — Copyright JetBrains s.r.o., licensed under the **SIL Open Font License, Version 1.1**.
- All eight shipped archetype `Guidance` markdown documents in `metadata/video-archetypes/guidance/*.md` are original MemberJunction works; no HyperFrames skill text was copied or adapted.
