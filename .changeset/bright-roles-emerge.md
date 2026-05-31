---
"@memberjunction/core": minor
"@memberjunction/cli": patch
---

Add deterministic baseline migration toolchain (`mj baseline build` / `compare` / `roundtrip`): introspects + emits the full MSSQL schema (tables, views, procedures, functions, triggers, UDTs, extended properties, database principals, role memberships, and object/schema/type/database permissions) with proven byte-equivalence via the row-by-row comparator. AUTO within-major rebaseline mode derives `Major.Minor` and a `latestV+1m` timestamp from the source migrations directory. Ships with workbench end-to-end script and a `/create-new-baseline-migration` slash-command driver.
