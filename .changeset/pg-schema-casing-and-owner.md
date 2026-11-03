---
"@memberjunction/cli": patch
"@memberjunction/open-app-engine": patch
---

`mj migrate --schema <name>` now canonicalizes the target schema for the platform (lowercase on PostgreSQL) for both the `flyway:defaultSchema` placeholder and the migration history schema, matching what the Open App engine does at install. On PostgreSQL, the Open App engine now creates an app schema owned by the core schema's owner when the installing login is a member of that role, so CodeGen no longer fails with "must be owner of schema"; otherwise the schema is created as before and the install prints a warning with the `ALTER SCHEMA … OWNER TO` remedy.
