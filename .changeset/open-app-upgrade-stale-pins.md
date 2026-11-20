---
"@memberjunction/open-app-engine": patch
"@memberjunction/integration-test-suite": patch
---

`mj app upgrade` now removes package pins that the new app version no longer places in a workspace. Before, the upgrade only added the new manifest's packages, so a package that moved between groups (bizapps-forms 1.0.0 moves `forms-actions` from `shared` to `server`) or was dropped kept its old pin, and a version that omits the `packages` block entirely skipped the package step and kept every pin, and the install put a second copy of the app's packages next to the new one. The previous version's packages come from the installed `ManifestJSON`; a package another installed app declares keeps its pin, and dependencies the old version did not declare are never touched. `AddAppPackages` takes the previous packages as the new `PreviousPackages` option and reports the removed pins in `Removed` (#6789). Integration check OLS11 (IT178) proves it against a live database and a real pnpm install.
