---
"@memberjunction/worker-host": patch
---

New server-only package `@memberjunction/worker-host`. `WorkerThreadHost` is a base class for a singleton that runs one kind of CPU-heavy work on a long-lived worker thread, so it cannot block the event loop that serves every HTTP request and WebSocket (MJ #5510). It restarts a worker that dies, disables itself after 3 deaths within 60 seconds (callers then run the work in-process), and has a per-host environment switch to force in-process. `ServeWorkerRequests` is the worker-script side. Local embeddings and the Web Page Content action use it.
