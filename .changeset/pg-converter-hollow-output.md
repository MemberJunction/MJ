---
"@memberjunction/sql-converter": patch
---

Never write a hollow `.pg.sql`. When the dialect could not emit a single statement in a migration, the converted body was a header and a gap banner over nothing, yet the result was still returned as `converted` — so the CLI wrote it as a discoverable `.pg.sql` that satisfies filename parity, contains no T-SQL, applies to PostgreSQL without error, and does nothing. Skyway then records the migration as applied while the schema change never happens. A fully-gapped conversion is now promoted to `needs-hand-authoring`, routing it to `.needs-hand` exactly as the empty-marker path already does. Partially-gapped conversions (the ordinary `--allow-gaps` case) and all-dropped files are unaffected.
