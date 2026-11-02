---
"@memberjunction/cli": patch
---

`mj dev workspace doctor` now checks member packages' build output (#5494). Linking a package links its source folder, so a package that was never built, or was edited after its last build, used to pass doctor and fail only when Explorer loaded it (a missing export, or "No form is registered for …").

- **Which packages.** Every package in a workspace member that has a `build` script and a `src/` folder. A package whose entry point is inside `src/` or at its root ships source and is not checked.
- **Where the output is.** The folder holding the entry file the package declares (`main`, else `module`, else the `exports` root). With none declared, `dist/`.
- **Missing output fails** (doctor exits 1) when that entry file, or `dist/`, does not exist.
- **Stale output warns** when a `src/` file is newer than every file in the output folder. Test files (`*.spec.*`, `*.test.*`, `__tests__/`) do not count. It is a warning because a branch switch can update file times without changing code.
- The fix names the package: `pnpm --filter <package> run build` at the parent. The check skips until `pnpm install` has run at the parent.
