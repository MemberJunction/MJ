---
"@memberjunction/scheduling-engine": minor
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/archiving-engine": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-communications": patch
---

Runtime SQL dialect correctness on PostgreSQL:

- **scheduling-engine**: PostgreSQL-correct heartbeat lease extension — affected-rowcount handling +
  mixed-case column quoting in `spExtendScheduledJobLease`, with a PG-only migration. *(migration → minor)*
- **postgresql-dataprovider** + call-sites (archiving-engine, core-entities, ng-dashboards,
  ng-entity-communications): translate T-SQL date functions (`GETDATE()`, `DATEADD`, etc.) in
  runtime SQL clauses to PostgreSQL equivalents. *(code → patch)*
