---
"@memberjunction/integration-test-suite": patch
---

Skip `private: true` packages in `validate-npm-packages.sh`, the `publish.yml` gate that checks every `@memberjunction/*` package already exists on npm.

The gate exists to predict whether `npm run change publish` will succeed, but it filtered only on the `@memberjunction/` scope and never read `.private`. Changesets never publishes a private package (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`), so for a private package the gate was asking a question with no bearing on the outcome it gates, and failing the release over the answer.

The gap had been masked by workarounds rather than hit: `@memberjunction/mobile-app` and `@memberjunction/ng-test-utils` are both `private: true` yet sit on npm at `0.0.0` and `0.0.1`, throwaway placeholders published purely to satisfy this check. They have stayed frozen at those versions ever since while the in-repo versions moved on, which is what a placeholder for a private package always decays into. `@memberjunction/integration-test-suite` is the first private package added since, so v5.49.0 is the first release where the gate actually fails.

Skips are logged rather than silent, so an accidental `"private": true` on a package that should ship is still visible in CI output — preserving the only real signal the old behavior provided, without blocking the release on it. The gate still fails correctly for genuinely missing public packages.
