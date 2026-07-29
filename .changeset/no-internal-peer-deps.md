---
'@memberjunction/ng-test-utils': patch
---

Remove the internal `@memberjunction/core` peerDependency — the repo's only internal peer. Semver ranges exclude prereleases, so during an Edge (changesets pre-mode) window any internal peer range is out of range for every `-edge.N` version and, with `onlyUpdatePeerDependentsWhenOutOfRange` plus the repo-wide fixed group, escalates all packages to a silent major bump. Core stays available via devDependencies (the package is private and never published). A new CI guard (`npm run check:peer-deps`, "No internal peerDependencies" workflow) blocks internal peerDependencies repo-wide.
