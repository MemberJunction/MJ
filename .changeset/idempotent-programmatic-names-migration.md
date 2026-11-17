---
"@memberjunction/core": minor
---

The migration that stores entity and field programmatic names (`V202611091235`) can now be run more than once. Deployments on 6.1.x or 6.2.x can apply it by hand to get the faster metadata load before upgrading, and the upgrade then re-runs it without errors. The column and description adds only run when missing, the triggers use `CREATE OR ALTER`, and the backfill writes only rows whose stored name differs, so a repeat run changes nothing and does not bump `__mj_UpdatedAt`.
