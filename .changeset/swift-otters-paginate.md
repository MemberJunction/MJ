---
"@memberjunction/server": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-artifacts": patch
---

Fix Query Builder ad-hoc query results being capped at 100 rows with no working pager. The ad-hoc query resolver now paginates the first page (StartRow 0) and reports the true total row count via a COUNT(*) query instead of a TOP-N cap, and the data grid no longer collapses value-identical rows from queries without an ID column. The artifact viewer title and grid toolbar now show the true total row count.
