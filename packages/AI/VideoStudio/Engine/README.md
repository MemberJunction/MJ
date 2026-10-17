# @memberjunction/video-studio

`@memberjunction/video-studio` is the server-side engine and action package for MemberJunction Video Studio, housing `VideoRenderEngine` drivers, pre-production asset actions, and data snapshot actions. The brand-kit and archetype caches (`BrandKitEngine`, `VideoStudioEngine`) live in `@memberjunction/core-entities` so browser and server share them. It runs inside MJAPI with standard `contextUser` authorization and delegates all headless Chromium and FFmpeg composition rendering over the wire contract to `@memberjunction/video-studio-render-worker` rather than executing untrusted composition bundles in-process. See [plans/video-studio.md](../../../../plans/video-studio.md) for the full specification.

## Rendering (`VideoRenderEngine`)

`VideoRenderEngine` (`VideoRenderEngine.Instance.Driver`) is the process-wide singleton port (`BaseSingleton` + `IShutdownable`) that resolves and manages the active `VideoRenderDriverBase` implementation via `MJGlobal.Instance.ClassFactory`.

### `mj.config.cjs` Configuration

Add the optional `videoStudio.render` block to `mj.config.cjs` (omitted fields fall back to defaults; invalid values log a warning and fall back to defaults without throwing):

```javascript
module.exports = {
  // ...existing MJ configuration...
  videoStudio: {
    render: {
      // 'LocalWorker' (default) | 'Remote' (VS-RND-3) | 'Docker' (VS-RND-4)
      driver: 'LocalWorker',
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
        // Base HTTP/HTTPS URL of the remote render worker or load balancer (or env VIDEO_STUDIO_RENDER_URL)
        // url: 'https://render-worker.internal.example.com',
        // Bearer token sent in Authorization: Bearer <token> (or env VIDEO_STUDIO_RENDER_TOKEN)
        // token: process.env.VIDEO_STUDIO_RENDER_TOKEN,
      },
    },
  },
};
```

### Render Drivers

| Driver (`videoStudio.render.driver`) | Description | Network Isolation (`Driver.IsNetworkIsolated`) |
| --- | --- | --- |
| `LocalWorker` *(default)* | Managed local child process (`LocalWorkerRenderDriver`). Spawns `@memberjunction/video-studio-render-worker` (`mj-video-render-worker`) on `127.0.0.1:0` with a sanitized environment allowlist (`BuildWorkerEnv` — never passes MJAPI database or vendor secrets) and a fresh 32-byte random bearer token per spawn. Cannot run as root (`uid === 0`): the worker refuses root unless `VIDEO_STUDIO_RENDER_ALLOW_ROOT=1` is set, and `BuildWorkerEnv` never forwards that variable. | `false` — **Development / single-node trusted compositions only.** Logs a one-time startup warning (`LOCAL_WORKER_NETWORK_WARNING`) when selected. |
| `Remote` | Stateless HTTP/HTTPS client (`RemoteRenderDriver`) targeting an external render worker endpoint via `RenderWorkerHttpClient`. Configured via `videoStudio.render.remote.url` / `.token` (with fallback to `VIDEO_STUDIO_RENDER_URL` / `VIDEO_STUDIO_RENDER_TOKEN`; `mj.config.cjs` wins over env). Logs a one-time warning per driver instance if a plain `http://` URL targets a non-loopback host because the bundle's frozen data snapshot travels in the request body. | `false` (unless egress is blocked at the remote deployment layer) |
| `Docker` *(VS-RND-4)* | Hardened container driver (`DockerRenderDriver`) running `mj-video-render-worker` with `--network none`, `--read-only`, `--cap-drop=ALL`, and `--security-opt=no-new-privileges`. | `true` — **Required boundary for untrusted compositions (Decision 4 / D15).** |

### Running a Remote Worker Pool (`Remote` Driver)

Deploy `@memberjunction/video-studio-render-worker` using its container image (`packages/AI/VideoStudio/RenderWorker/Dockerfile`, listening on `0.0.0.0:8080` as non-root `uid 10001`):

```bash
docker run --rm -p 8080:8080 \
  -e VIDEO_STUDIO_RENDER_TOKEN="replace-with-strong-shared-secret" \
  mj-video-render-worker:latest
```

- **Bearer token is the only credential:** The worker refuses to bind to a non-loopback address without `VIDEO_STUDIO_RENDER_TOKEN` and checks `Authorization: Bearer <token>` on every route (including `GET /health`). The worker never holds database, storage, or AI vendor credentials; that bearer token is the only credential the worker ever holds.
- **TLS termination:** Composition bundles include the frozen `data.json` snapshot. Terminate TLS at your ingress or reverse proxy and point `videoStudio.render.remote.url` (or `VIDEO_STUDIO_RENDER_URL`) at the `https://` endpoint. Plain `http://` to a non-loopback address is permitted for cluster-internal networks that terminate TLS at the mesh/ingress layer, and logs one warning per driver instance.
- **Scaling:** Each worker runs one render job at a time by default (`VIDEO_STUDIO_RENDER_CONCURRENCY=1`) and serializes excess requests in-process. Scale throughput horizontally by running multiple worker replicas behind a load balancer (use sticky sessions or short-lived affinity only if `POST /render` and the immediate `GET /videos/<VideoID>` traverse separate load-balanced hops, or front each replica behind a session-consistent proxy).


