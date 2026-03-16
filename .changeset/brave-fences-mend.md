---
"@memberjunction/external-change-detection": patch
"@memberjunction/server-bootstrap": patch
---

Fix transaction race condition in ExternalChangeDetection concurrent replay by creating per-save provider instances with independent transaction state, sharing the singleton's connection pool
