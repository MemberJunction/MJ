---
'@memberjunction/db-auto-doc': patch
---

DBAutoDoc now writes detected transitive bridge views in the analyzed database's SQL dialect.

The bridge-view body DBAutoDoc emits into additionalSchemaInfo (`TransitiveView.SQL`) was always
bracket-quoted SQL Server syntax, and CodeGen executes that body verbatim — so organic keys detected
on a PostgreSQL database produced a bridge view PostgreSQL could not create. Identifiers are now
quoted per `database.provider`: brackets on SQL Server (unchanged), double quotes on PostgreSQL and
Oracle, backticks on MySQL. On PostgreSQL the quoting also preserves mixed-case names, which would
otherwise fold to lower case and stop matching the catalog. Companion to the CodeGen fix for #4409.
