---
"@memberjunction/server": patch
---

Clean `dist` before building MJServer, so a deleted source file cannot strand a compiled orphan.

`tsc` only writes outputs — it never prunes them. When a source file is deleted, its previously-compiled `.js` survives in `dist/`, and because MJServer loads resolvers by glob, that orphan still gets imported at runtime. The build stays green (TypeScript compiles the current sources fine) and then the server dies on boot with an error pointing at a file that no longer exists in source.

This happened for real: the v6 legacy-retirement work deleted `src/resolvers/ReportResolver.ts`, but every developer with a pre-existing `dist/` kept `dist/resolvers/ReportResolver.js`, which still did `import { RunReport } from '@memberjunction/core'` — an export removed in the same change. Result: `SyntaxError: The requested module '@memberjunction/core' does not provide an export named 'RunReport'`, MJAPI refusing to start, and a confusing hunt because the offending file isn't in the repo. A fresh CI checkout was unaffected (empty `dist`), so published packages were never at risk — this is purely a local incremental-build trap.

Adding `"prebuild": "rimraf dist"` makes it structurally impossible. `rimraf` is already the convention for this in `MJCLI`, `CLICore`, and `MJCodeGenAPI`.
