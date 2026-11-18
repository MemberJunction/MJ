---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/record-set-processor-base": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-entity-viewer": patch
---

Replace backtracking regexes (CodeQL `js/polynomial-redos`) with linear scans: new `SqlTypeBaseName` in `@memberjunction/core` for stripping a SQL type's parameter list, an index scan for query template tags, a linear parser for simple aggregate expressions, and a loop for the next token in a SQL Server `DECLARE` list. Results are unchanged for every input.
