---
"@memberjunction/codegen-lib": patch
---

Keep disambiguating a colliding entity name until it is actually free

Entity names are generated from the table name with trailing discriminators stripped, so
distinct tables routinely generate the same name. When that happened, CodeGen appended the
schema name once and assumed the result was unique — but it is not, and nothing re-checked it.

With a NetSuite catalog, `customlist72`, `customlist74`, `customlist160`, `customlist436`,
`customlist534` and `customlist873` all generate "Custom Lists". The first took the plain name,
the second took `Custom Lists__netsuite`, and every one after that produced the identical
`Custom Lists__netsuite` — a duplicate-key failure on `UQ_Entity_Name`, so those entities were
never created. CodeGen carried on and emitted only a repeated identical INSERT error, leaving
the install short several entities with no indication of which or why.

The disambiguation now continues past the schema suffix with a counter until the name is free,
bounded so a schema where everything collapses to one name still fails loudly rather than
hanging. Name comparison is also now case-insensitive on both sides, matching the collation
`UQ_Entity_Name` is enforced under — the in-run check used an exact `===` while the metadata
check beside it lowercased, so names differing only in case read as free and then collided on
insert.

The logic is extracted as `ManageMetadataBase.resolveUniqueEntityName` and unit-tested.
