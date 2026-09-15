---
'@memberjunction/open-app-engine': patch
'@memberjunction/dynamic-packages': patch
'@memberjunction/cli': patch
---

Open App manifests can declare where a package runs: `platform: "node" | "browser" | "both"` on any `packages` entry. `mj app install` no longer writes Node-only `shared` packages into `dynamicPackages.client`, so an app that ships an actions package under `shared` can no longer break the host Explorer's build with unresolvable `fs` / `child_process` imports from `@google-cloud/storage` (#4428).

`platform` defaults to `node` for role `actions` and `both` for every other role, so no existing manifest changes meaning. Apps that declare a Node-only package under `shared` with role `library` — every first-party BizApp does — should add `"platform": "node"` to that entry. Once an app's manifest declares `platform: "node"` on that entry, hosts already carrying the bad entry drop it on their next `mj app upgrade`, which prunes against the corrected rule — the self-heal only takes effect after the publisher ships that manifest change; it does not happen on its own against an unchanged manifest.

A manifest that puts `platform: "node"` in `client[]` (or `"browser"` in `server[]`) is now rejected at validation with a message naming the package.
