---
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
---

The PostgreSQL provider now rewrites client filter and order clauses (field-name quoting, bracket identifiers, date functions, boolean literals) in code only: string literals, `E''` and dollar-quoted strings, quoted identifiers and comments stay as written. It refuses a clause that PostgreSQL cannot read, or whose rewritten code words are not the original code words in the same order (apart from the words the rewrites add). Live document blocks now read an ExtraFilter with the shared dialect-aware SQL scanner, accept only `'...'`/`N'...'` strings and `[bracketed]` identifiers, and return a generic message when the view query fails.
