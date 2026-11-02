---
"@memberjunction/video-studio": patch
---

The Video Studio seed tests no longer require the seed records to lack a `sync` block. `mj sync push` writes that block back into the metadata files when the seeds are first pushed, which the v6.2.0-edge.7 release push did, so the assertion failed on every run after it.
