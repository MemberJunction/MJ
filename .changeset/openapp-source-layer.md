---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
"@memberjunction/testing-integration": patch
---

Open Apps can be installed from a folder in the consumer repository. `mj app install ./openapps/analytics` stores the app as a `file:` locator relative to the repository root (`file:openapps/analytics`), and `mj app upgrade`, `mj app remove` and `mj app check-updates` read the app from that folder. The folder's version is the `version` in its `mj-app.json`. Its migrations, `-pg` migrations and teardown scripts are copied with the same rules as a GitHub download. Its npm packages are written as `workspace:*`, and the install stops before any change when a package is not a project in the pnpm or yarn workspace. Remove reads the installed version's migrations and teardown scripts from the folder, so it stops before any change when the folder is at another version.

A dependency can name another local app with a `file:` locator, but only from an app that is itself installed from a local folder. `mj app upgrade --reapply` runs the upgrade again at the installed version, so changes in a local folder apply without a version bump.

The engine reads every manifest, version and SQL file through an `OpenAppSource` (`GitHubAppSource` or `LocalAppSource`), selected by `ResolveAppSource`. GitHub installs call the GitHub client with the same arguments as before.

The deterministic integration tier has a new bundle, `open-app-local-source` (IT176), that installs, upgrades and removes apps from a throwaway pnpm workspace against the live database. `@memberjunction/testing-integration` exports its fixture type, `OpenAppLocalSourceFixture`.
