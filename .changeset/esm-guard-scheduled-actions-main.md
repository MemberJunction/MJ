---
"@memberjunction/scheduled-actions-server": patch
---

Repoint `main` from `src/index.ts` (TypeScript source) to `dist/index.js` so the package entry resolves for native-Node and published consumers, not just `tsx` (#3142). Also adds the repo-level native-ESM import guard (`.github/scripts/check-esm-imports.mjs`, wired into the unit-test workflow) that catches extensionless-specifier dist breaks (#3137's bug class) monorepo-wide.
