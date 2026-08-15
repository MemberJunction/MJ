---
'@memberjunction/search-engine': minor
---

Search: verify that a result group's records belong to the entity it is attributed to

`SearchEngine.filterEntityResults` groups results by `EntityName`, resolves that entity, checks
`CanRead`, and then — when the entity has no row filter for the caller, or the caller is exempt from row
filtering — admitted the whole group without checking the record ids were that entity's records at all.

`CanRead` establishes that a user may read an entity. It does not establish that a result *is* one of
that entity's rows. And `EntityName` is provider output: the vector lane reads it from the vector's own
`Entity` metadata key, and the 3rd-party lanes (Azure AI Search, Elasticsearch, Typesense, OpenSearch)
use the index or collection name. Whoever populates an index therefore chose which entity's permissions
were evaluated for its documents — label an index after an entity the caller can read, and its documents
were admitted, with each result's Title, Snippet and RawMetadata rendered from that index's own metadata.

The check now runs for those groups. It is the same query the row-filter path already used — a
primary-key `IN` against the attributed entity's own view, keeping only the ids that come back — so this
reuses an existing, tested code path rather than adding a mechanism.

**Lanes that queried the entity directly are exempt, so the common path costs nothing.** An `entity` or
`fulltext` result's ids came out of a `RunView` against that entity and are its records by construction.
Everything else is verified, including any `SourceType` a 3rd-party provider defines — an allowlist, so
an unanticipated source type is verified by default rather than trusted by default. A mixed group is
partitioned: the self-evident results pass straight through and only the rest are queried.

Row-filtered groups behave exactly as before; that path already verified ownership as a side effect of
filtering. RLS-**exempt** callers are now verified too, deliberately: exemption says which *rows of an
entity* a user may see, not whether a result belongs to that entity.

**Behaviour change worth noting before upgrading:** a deployment that has been returning results whose
`EntityName` does not match the entity their ids belong to will see those results disappear. That is the
intent, but it is a change — if search results drop after this upgrade, the labels were wrong, and
`Residual permission filter removed N result(s)` in the log identifies where.

`filterByRowLevelSecurity` is renamed `verifyOwnershipAndRowFilters` to match what it now does; it is
private, so nothing outside the class is affected.

**Why `minor` rather than `patch`:** this change is code-only, but it ships in the same branch as a
`metadata/` JSONType addition, and the bump rule is evaluated per branch — see
`.claude/rules/changesets.md`.
