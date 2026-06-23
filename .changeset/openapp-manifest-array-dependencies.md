---
"@memberjunction/open-app-engine": patch
---

feat(open-app): accept array-form `dependencies` in the manifest (normalize to record)

The manifest schema only accepted `dependencies` as an object/record keyed by app name, but several published Open Apps (e.g. `bizapps-tasks`, `bizapps-issues`) ship `dependencies` as an **array** of `{ name, repository, versionRange }` entries — which failed validation with `dependencies: Expected object, received array`, making those apps uninstallable.

The schema now accepts **either** form and normalizes the array to the canonical record (`name` → key, `versionRange` → `version`, `repository`/`subpath` preserved), so dependency resolution downstream still sees a single shape. The record form is unchanged. In keeping with the manifest-as-source-of-truth model, this makes the manifest lenient in what it accepts without changing what the engine consumes.
