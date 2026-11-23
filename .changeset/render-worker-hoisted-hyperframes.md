---
"@memberjunction/video-studio-render-worker": patch
---

Find installed `@hyperframes/*` packages through Node's lookup folders, so the render worker health check no longer reports them missing on npm (hoisted) installs.
