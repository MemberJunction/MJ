---
"@memberjunction/core": minor
"@memberjunction/cli": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/codegen-lib": patch
---

After each Open App migrate (`mj migrate --schema` and `mj app install`), run the core metadata-heal steps (SQL Server: R__RefreshMetadata members with dependency-ordered view refresh; PostgreSQL: AllowsNull, orphan prune, catalog Sequence). CodeGen inserts new EntityFields at the live BaseView ordinal after parking existing sequences, then `spUpdateExistingEntityFieldsFromSchema` rewrites the entity — Pass 2 after views are current.
