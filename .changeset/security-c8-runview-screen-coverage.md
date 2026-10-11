---
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
"@memberjunction/lists": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-rubrics": patch
"@memberjunction/ng-conversations": patch
---

Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and the provider exposes it as `ScreenClientClause`. It now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), every ad-hoc list source by default (client-supplied, from the list and audience actions, or rebuilt from a stored list snapshot), the REST view routes (which also refuse a `ViewEntity` that was not loaded as an entity), and a saved view's stored WhereClause and sort (on save, and again when the view runs). The screen refuses a subquery over an entity the acting user reads under a row filter (role row-level security or an API-key row filter) or with denied fields, the queried entity included, because a subquery reads the base view without them; the ad-hoc SQL screen uses the same rule. The rubric comparison matrix and the conversations UI (the tasks view, task search and the agent artifact lookup) now read the IDs they filter by with their own RunView instead of a subquery over those views. On PostgreSQL the screen reads `[Name]` bracket identifiers as the PostgreSQL provider does. Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments, and a view ID is spliced into SQL only when it is a GUID. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.
