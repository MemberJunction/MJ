---
"@memberjunction/server": patch
---

Fix RemoteBrowserAudioStream unit test by adding a stub BaseArtifactToolLibrary export to the inert ai-core-plus mock, satisfying the runtime base class pulled in transitively via the artifact-tool manager.
