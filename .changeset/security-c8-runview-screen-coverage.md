---
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
"@memberjunction/lists": patch
"@memberjunction/core-entities-server": patch
---

Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), ad-hoc list sources (client-supplied and rebuilt from a stored list snapshot), the REST view routes, and a saved view's stored WhereClause and sort (on save, and again when the view runs). Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.
