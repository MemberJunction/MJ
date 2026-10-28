---
"@memberjunction/installer": patch
"@memberjunction/cli": patch
"@memberjunction/document-parsing": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/actions-bizapps-formbuilders": patch
---

Installer and CLI fixes. `mj install` without `--tag` now pins the CLI, migrate and codegen to the release the scaffold resolved (persisted for resume) instead of npm's `latest` dist-tag, and warns when it has to fall back to `latest`. `--dir` is resolved to an absolute path, the resume guidance names that directory, and Windows gets a 30-minute dependency-install timeout. Monorepo installs clone the release tag with `git clone --depth 1` instead of extracting the zipball, and force pnpm. `mj migrate` defaults its request timeout to 30 minutes and names `MJ_MIGRATION_REQUEST_TIMEOUT` when a request times out. pdf-parse is raised to `^1.1.4`.
