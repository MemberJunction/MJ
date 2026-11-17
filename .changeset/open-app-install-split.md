---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

`mj app install` can run its package step and its database step separately, for Docker images. `--packages-only` changes only `package.json`, the lockfile, `mj.config.cjs` and `angular.json` for the app and its dependencies, and opens no database connection, so it can run in a Docker build. `--database-only` creates the schema, runs the migrations, records the app and runs its post-install steps, and changes no files, so it can run at container start. The flags cannot be used together. The engine adds `InstallAppPackages` with a `PackageStepContext` (no database members) and the `PackagesOnly` / `DatabaseOnly` install options.
