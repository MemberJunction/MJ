---
"@memberjunction/component-registry-server": patch
---

Add router mode support to ComponentRegistryAPIServer

Enables mounting the registry as an Express Router on existing
applications instead of running as a standalone service. The
server can now operate in 'router' mode (returns Express Router)
or 'standalone' mode (default, unchanged behavior).

New `ComponentRegistryServerOptions` interface supports mode
selection, custom base paths, and optional database setup
skipping
