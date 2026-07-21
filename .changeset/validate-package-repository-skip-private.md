---
"@memberjunction/integration-test-suite": patch
---

Skip `private: true` packages in `validate-package-repository.sh`, matching the rule PR #3236 established in `validate-npm-packages.sh` — so both publish gates now answer "is this a package we publish?" the same way.

The gate requires `repository.url` for npm sigstore provenance, which only applies to published packages: npm refuses to attest a private package, and changesets never publishes one (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`). Requiring the field on a private package forced inert metadata — `@memberjunction/integration-test-suite` had a `repository` block added purely to satisfy this gate, hours before the sibling gate was fixed properly.

Skips are logged rather than silent, mirroring the sibling gate. Unlike the npm-existence gate (network-bound), this script is pure-local, so it now has a fixture-based vitest suite in `.github/scripts/__tests__/` covering the skip, the not-blunted property (private skip + public failure in one run), and predicate parity with changesets truthiness.

Also updates `DEPLOYMENT.md` Step 5 and `NEW_PACKAGE_SETUP.md`, which still described the pre-#3236 behavior ("lists every package missing from npm") — the script now lists every *publishable* package missing, and private packages need no placeholder.
