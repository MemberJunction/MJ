---
"@memberjunction/mobile-app": patch
---

The library-registry test that imports every mobile library for real now has a 30-second limit instead of vitest's 5-second default. Importing the whole registry cold on a busy CI shard occasionally ran past 5 seconds and failed unrelated PRs. Test-only; no runtime change.
