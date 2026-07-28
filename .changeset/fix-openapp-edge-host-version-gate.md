---
"@memberjunction/open-app-engine": patch
---

fix(open-app): coerce prerelease host versions to base tuple in the MJ version compatibility gate

`CheckMJVersionCompatibility` called `semver.satisfies(mjVersion, range)` directly, and semver ranges exclude prerelease versions unless tuple-anchored. Once MJ's Edge prerelease grammar activates (every dev/fast-channel build versioned `X.Y.Z-edge.N`), every dev host would fail `satisfies('6.2.0-edge.3', '>=6.0.0 <7.0.0')` and reject every app install even though the app's range is era-correct.

The host MJ version is now coerced to its base release tuple (`6.2.0-edge.3` → `6.2.0`) via the new exported `CoerceToBaseVersion` helper before the range check. Base-tuple coercion is used instead of `{ includePrerelease: true }` because semver orders a prerelease below its release: `satisfies('7.0.0-edge.0', '>=6.1.0 <7.0.0', { includePrerelease: true })` is `true`, so a 7-era Edge host would wrongly pass a `<7.0.0` cap — coercion correctly fails it as `7.0.0`.

Only the host-side gate changes; installed app/dependency version comparison (`CheckDependencyVersionCompatibility`, `IsValidUpgrade`) is untouched (tracked separately in #3310).
