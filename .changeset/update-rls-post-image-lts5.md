---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

Updates are now checked against row-level security with their new values as well as the stored row. A user whose Update permission carries a row-level security filter could open a row they were allowed to edit, change the column the filter tests (for example the organization), and save it, moving the row out of their scope. That save is now refused with "the requested changes would move this record outside your permitted row scope". Saves that keep the row in scope behave as before. (#5783)

The row these checks test (the Update check above and the existing Create check) now includes NULL columns as typed `CAST(NULL AS <type>)`, mapped through the provider's SQL dialect. Before, a NULL column was left out, so a filter that referred to it failed with `Invalid column name` instead of evaluating; with the Update check that would have broken in-scope saves for users whose filters are joined with OR (two filtered roles) when a column in another branch is NULL.
