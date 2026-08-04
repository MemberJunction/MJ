---
"@memberjunction/standards": minor
---

New package: `@memberjunction/standards` — MJ's executable engineering standards as versioned, opt-in checks, with a scaffold (`adopt`), a runner (`check`), a registry view (`list`), and a standalone `mj-standards` binary for repos that don't install the MJ CLI. Adding a standard here never changes an already-adopted repo's result: checks are opt-in per repo, pinned to the version the repo adopted against, and carry their severity in the repo's own `.mj-standards.json`.

Ships with one check, `ui-layers` (since 6.0.0), which enforces the four-layer UI architecture. MJ itself now adopts the package and the duplicate `.github/scripts/check-ui-layers.mjs` is deleted.
