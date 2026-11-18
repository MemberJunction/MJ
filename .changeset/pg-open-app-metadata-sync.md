---
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
---

PostgreSQL converter: an Open App's `[${mjSchema}].sp…` core calls in an mj-sync log now convert on the legacy path, keeping `${mjSchema}` for the installer to substitute; and on the split / bake path an mj-sync log is converted inline (one `DO` block per save) instead of becoming a "re-seeded by `mj sync push`" marker, so a migrate-only install gets its seed rows (#5543). A save that does not convert is a reported gap.
