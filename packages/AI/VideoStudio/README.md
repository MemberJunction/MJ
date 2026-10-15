# Video Studio Packages

Video Studio turns a brief, brand kit, data sources, and asset pack into deterministic, broadcast-grade deliverables (multi-aspect MP4s, keyframes, captions, contact sheets, and a review manifest) governed by a canonical `VideoGenerationSpec`. See [plans/video-studio.md](../../../plans/video-studio.md) for the full architecture and production pipeline.

## Packages

| Directory | Package Name | Runtime | Purpose |
|---|---|---|---|
| `Core` | `@memberjunction/video-studio-core` | Browser + Server | Pure TypeScript contracts (`VideoGenerationSpec`, archetype JSON types, render wire contract) and stage-aware spec validation. Must never import Node-only or server-side database modules. |
| `Engine` | `@memberjunction/video-studio` | Server (MJAPI) | Orchestration engines (`VideoStudioEngine`, `BrandKitEngine`, `VideoRenderEngine`), agent actions, and artifact drivers. |
| `RenderWorker` | `@memberjunction/video-studio-render-worker` | Separate Node >= 22 Process | Isolated HyperFrames + headless Chromium render worker. Accepts self-contained project bundles over HTTP/Unix socket and must never hold MemberJunction database access or provider credentials. |
