---
"@memberjunction/ai-agents": patch
---

`AgentRunner` reads a file-backed artifact's bytes through `FileStorageEngine.ResolveFileObject` (the storage-account gate and the tracked-file rule), like every other file-ID route, instead of taking the provider's first account straight to the driver. The file ID is validated as a UUID and escaped before it reaches SQL (it was interpolated raw). The reader is now a protected extension point, `DownloadArtifactFileContent`.
