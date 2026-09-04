---
"@memberjunction/dynamic-packages": patch
"@memberjunction/cli": patch
"@memberjunction/ai-cli": patch
"@memberjunction/testing-cli": patch
---

Follow-ups to the dynamic-package loader (#4199) from testing it end to end:

- The `mj` CLI's config schema no longer requires `AppName` on hand-authored `dynamicPackages.server[]` entries and accepts every `policy` value the loader accepts, so the README's own examples no longer make `mj migrate` / `mj clean` / `mj app check-updates` abort with a misleading "Database credentials are missing" error.
- A workspace member found on disk via `mj-app.json` but not yet built is reported as not-found (with the missing entry file named) instead of as a load failure that warned on every command.
- The standalone `mj-ai` / `mj-testing` provider bootstraps log through a new `StderrDynamicPackagesLogger`, so `--format=json` / `--output=json` stdout is no longer prefixed with loader progress lines.
- README: scoping examples use `cli:codegen` instead of `cli:migrate` (migrate is a light command that never loads app packages), and mode `none` is documented as skipping the host's generated packages too.
