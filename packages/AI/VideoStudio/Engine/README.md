# @memberjunction/video-studio

`@memberjunction/video-studio` is the server-side engine and action package for MemberJunction Video Studio, housing `VideoStudioEngine`, `BrandKitEngine`, `VideoRenderEngine` drivers, pre-production asset actions, and data snapshot actions. It runs inside MJAPI with standard `contextUser` authorization and delegates all headless Chromium and FFmpeg composition rendering over the wire contract to `@memberjunction/video-studio-render-worker` rather than executing untrusted composition bundles in-process. See [plans/video-studio.md](../../../../plans/video-studio.md) for the full specification.

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
    },
  },
};
```

### Render Drivers

| Driver (`videoStudio.render.driver`) | Description | Network Isolation (`Driver.IsNetworkIsolated`) |
| --- | --- | --- |
| `LocalWorker` *(default)* | Managed local child process (`LocalWorkerRenderDriver`). Spawns `@memberjunction/video-studio-render-worker` (`mj-video-render-worker`) on `127.0.0.1:0` with a sanitized environment allowlist (`BuildWorkerEnv` — never passes MJAPI database or vendor secrets) and a fresh 32-byte random bearer token per spawn. Refuses to run as root (`uid === 0`) unless `VIDEO_STUDIO_RENDER_ALLOW_ROOT=1` is set in the worker. | `false` — **Development / single-node trusted compositions only.** Logs a one-time startup warning (`LOCAL_WORKER_NETWORK_WARNING`) when selected. |
| `Remote` *(VS-RND-3)* | Stateless HTTP/HTTPS client targeting an external render worker service (`RemoteRenderDriver`) over `RenderWorkerHttpClient`. | `false` (unless isolated at the remote deployment layer) |
| `Docker` *(VS-RND-4)* | Hardened container driver (`DockerRenderDriver`) running `mj-video-render-worker` with `--network none`, `--read-only`, `--cap-drop=ALL`, and `--security-opt=no-new-privileges`. | `true` — **Required boundary for untrusted compositions (Decision 4 / D15).** |

