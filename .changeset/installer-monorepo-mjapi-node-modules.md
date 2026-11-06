---
"@memberjunction/installer": patch
---

`mj install --monorepo`: CodeGen's CLI lookup and artifact check also look in `packages/MJAPI/node_modules`, where a pnpm monorepo install links `mj_generatedentities` and the CLI; the missing-artifact message names every location, the detected layout's first. The database connectivity probe now reports "port reachable", since it does not sign in (#4562).
