---
'@memberjunction/cli': patch
---

`mj dev workspace` now reads each member's committed `mj-app.json` and registers every
`packages.client[]` and `packages.shared[]` entry in the generated parent `package.json` as
`dependencies` at `workspace:*` — the same set, at every role, that the host emits into
`dynamicPackages.client` and that `mj codegen manifest` turns into imports in an app shell's
generated class-registrations manifest. Unmet shell-provided peers of those packages are reported
per shell with the version the parent already pins (found under per-major override keys too), and
`mj dev workspace doctor` gains a check that a member's declared client packages are linked at the
parent — scoped to actual workspace members, and skipped until `pnpm install` has run there. Fixes
a page-load resolve failure that presented with a completely green build (#4364).
