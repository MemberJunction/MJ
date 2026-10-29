---
"@memberjunction/ai-agent-manager": patch
---

Declare the repo-root metadata its tests read as a turbo `test` input, so a metadata change re-runs them instead of replaying a cached pass. Adds a package `turbo.json`; no runtime change.
