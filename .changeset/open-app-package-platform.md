---
'@memberjunction/open-app-engine': patch
'@memberjunction/dynamic-packages': patch
'@memberjunction/cli': patch
---

Open App manifests can declare where a package runs: `platform: "node" | "browser" | "both"` on any `packages` entry. `mj app install` no longer writes Node-only `shared` packages into `dynamicPackages.client`, so an app that ships an actions package under `shared` can no longer break the host Explorer's build with unresolvable `fs` / `child_process` imports from `@google-cloud/storage` (#4428).

`platform` defaults to `node` for role `actions` and `both` for every other role, so a manifest with no `role: "actions"` entry routes exactly as before. A `role: "actions"` entry with no `platform` does change: under `shared` it no longer reaches `dynamicPackages.client`, and under `client` it is now rejected at validation. An app that declares a Node-only package under `shared` with role `library` (bizapps-ats and bizapps-caliber do, as of this release) should add `"platform": "node"` to that entry, or move it to `server`. Once an app's manifest does that, hosts already carrying the bad entry drop it on their next `mj app upgrade`, which prunes against the corrected rule — the self-heal only takes effect after the publisher ships that manifest change; it does not happen on its own against an unchanged manifest.

A manifest that puts `platform: "node"` in `client[]` (or `"browser"` in `server[]`) is now rejected at validation with a message naming the package. A `platform` value other than `node`, `browser` or `both` is rejected everywhere a manifest is read: `mj app install`, `mj dev workspace`, and the dynamic-package loader in a process running inside an Open App repository, which now warns with the file, package and value and loads none of that manifest's packages — the same handling as an unparseable `mj-app.json` — instead of silently skipping only the mistyped package.
