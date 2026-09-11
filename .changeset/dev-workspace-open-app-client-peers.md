---
'@memberjunction/cli': patch
---

`mj dev workspace` now reads each member's committed `mj-app.json` and registers its `role: bootstrap`
client packages in the generated parent `package.json` as `dependencies`, so an Open App's client
package resolves from the app shell that imports it through the generated class-registrations
manifest. Unmet shell-provided peers of those packages are reported per shell with the version the
parent already pins, and `mj dev workspace doctor` fails when a declared client package is not linked
at the parent. Fixes a page-load resolve failure that presented with a completely green build (#4364).
