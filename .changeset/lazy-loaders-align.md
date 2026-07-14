---
"@memberjunction/codegen-lib": patch
---

Fix `mj codegen manifest --lazy-config` generating invalid TypeScript when build tooling entered the app's dependency tree. Two fixes: (1) the lazy-config dependency walk now follows runtime `dependencies` only — packages reachable solely through a root `devDependency` (e.g. `@memberjunction/cli` and its server-side tree) no longer contribute browser lazy chunks; (2) loader variable names are package-qualified when two packages expose the same subpath export, so `./plugins` in two packages can never again emit duplicate `const loadPlugins` declarations (TS2451). Broke `next` after #3139 declared the CLI as a devDependency of MJExplorer.
