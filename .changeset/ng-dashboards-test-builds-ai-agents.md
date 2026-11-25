---
"@memberjunction/ng-dashboards": patch
---

Make `ng-dashboards` tests build `@memberjunction/ai-agents` first. `adminLimitsRoundTrip.test.ts` imports `packages/AI/Agents/dist/index.js` by relative path without declaring the package, so PR runs that do not touch `ai-agents` failed with `Cannot find module`. The test task in `dashboards/turbo.json` now depends on `@memberjunction/ai-agents#build`.
