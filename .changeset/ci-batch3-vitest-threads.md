---
"@memberjunction/metadata-sync": patch
---

Pin Vitest pool to `forks` in `@memberjunction/metadata-sync` so `PullService` tests using `process.chdir()` continue running in forked processes while the shared Node Vitest preset switches to worker threads.
