---
'@memberjunction/cli': patch
---

Follow-up to the Open App client bootstrap fix: number the generated namespace-import aliases off their position in `OPEN_APP_CLIENT_MODULES` rather than off the entry index, so the declared aliases and the array contents share one counter by construction. They agreed before, but nothing pinned that — and any skew between the two emits an array element naming a variable that was never declared, which surfaces as a TS2304 in the host app's build rather than a CLI test failure. Adds regression tests for mixed enabled/disabled entry sets and the all-disabled case, and records in the emitter's docs that the `globalThis` anchor is a deliberate variant of (not the same mechanism as) the `CLASS_REGISTRATIONS` array-spread anchor, and that a package declaring `"sideEffects": false` while self-registering classes is the underlying false declaration this block defends against.
