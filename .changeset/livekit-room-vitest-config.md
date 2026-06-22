---
"@memberjunction/ng-mj-livekit-room": patch
---

Add the missing `vitest.config.ts` to `@memberjunction/ng-mj-livekit-room` so its `test` script no longer fails resolving the root config's `projects` globs (the package has no tests yet; `passWithNoTests` from the shared config now lets the sweep pass cleanly).
