---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

Open App: exact version pins, per-repo tokens, and workspace-wide prefix bumps

- `--version` flag now pins packages to exact versions (no ^ prefix) and validates the GitHub tag exists before proceeding
- Per-repo GitHub token map (`openApps.github.tokens`) for multi-private-repo dependency chains
- `GetLatestVersion` falls back to tags when no GitHub Releases exist
- Schema reuse when `createIfNotExists: true` and schema already exists (adopts sidestep installs)
- Don't pass `--registry` for default npm registry (fixes private scoped package auth)
- Prevent duplicate `dynamicPackages.server` entries on re-install
- npm install failures demoted to warnings when package.json was updated (auth issues don't abort install)
- `packages.prefix` manifest field for workspace-wide dependency bumps during install/upgrade
