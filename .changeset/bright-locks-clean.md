---
"@memberjunction/actions-content-autotag": patch
"@memberjunction/scheduling-engine": patch
---

fix vectorization crash from using non-provider Metadata() fallback, and harden ScheduledJobEngine lock lifecycle with save verification and DB reload after stale lock cleanup
