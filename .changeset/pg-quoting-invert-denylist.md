---
"@memberjunction/codegen-lib": patch
---

Replace the PostgreSQL identifier-quoting denylist with a discriminator that cannot fall out of date.

`quoteSQLForExecution` decided whether to quote a PascalCase word by checking it against a 288-entry `_SQL_KEYWORDS` set. That is a denylist, and it is wrong by construction here, because the set of SQL keywords and the set of MJ column names overlap. Every name in the intersection was emitted unquoted, folded to lower case on PostgreSQL, and failed with `column "..." does not exist`.

The intersection is exactly eight names — `Action`, `Columns`, `Language`, `Length`, `Month`, `Rank`, `Text`, `Values` — obtained by intersecting the 1,413 columns in the PostgreSQL baseline DDL with the keyword set. It is not guessable: neither the report in #3604 nor the first fix predicted it correctly by inspection, and `Values` is the field-level-encrypted column on `__mj."Credential"`. It also grew silently — adding a column named `Rank` to any new entity re-opened the hole with nothing to signal it.

Quoting now keys on properties intrinsic to the two things rather than on a list. Generated SQL writes keywords, types and functions in ALL CAPS (`SELECT`, `VALUES (`, `LENGTH(`, `INT`); MJ identifiers are mixed case (`Length`, `Values`, `EntityID`). A word immediately followed by `(` is a function call whatever its casing. The denylist is still consulted, but only for ALL-CAPS words — the narrow band where it is unambiguous, since MJ columns are PascalCase.

The all-caps carve-out matters in both directions: an all-caps word that is *not* a keyword is still an identifier, so acronym columns such as `ID` and `URL` continue to be quoted. A pure case rule would have folded those to `id` / `url`.

Verified against the codebase before switching: `VALUES (` is written all-caps at every call site, and there are no mixed-case type casts — the two shapes that would break the case rule. Adds `pg-quoting-case-rule.test.ts`, which drives the real `quoteSQLForExecution` and asserts both halves: all eight colliding columns now quote in SELECT, SET and WHERE positions, while keywords, functions, casts, lowercase identifiers, `__mj_` internals, string literals, pre-quoted identifiers and `@parameters` are all untouched. It includes `SELECT Length, LENGTH(Name)` — the same word in both meanings, resolved in one statement without a list.

Addresses item 4 of #3604.
