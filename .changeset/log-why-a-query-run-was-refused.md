---
"@memberjunction/generic-database-provider": patch
---

Log, server-side, why a saved-query run was refused across all single and batch (`RunQueriesWithCacheCheck`) authorization gates. Three authorization paths end in the same caller-visible message (`User does not have permission to run query 'X' (ID: …)`) with nothing to tell them apart — the query's role list, SQL the field-security gate could not read, and a field-security violation. Only the field-security case logged anything previously, and only at `verboseOnly`. The refusal returned to the caller is unchanged; this adds the operator's copy, naming the reason, the query's required roles, and the count and names of roles loaded for the user.
