---
"@memberjunction/open-app-engine": patch
---

Enforce declared version ranges on fresh Open App dependency installs (#3310): each not-yet-installed dependency resolves to a concrete version before its manifest is fetched, the install uses that version, and two dependents requiring ranges the resolved version can't both satisfy fail naming both parents and ranges.
