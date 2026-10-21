---
"@memberjunction/a2aserver": patch
"@memberjunction/action-runtime-host": patch
"@memberjunction/actions": patch
"@memberjunction/actions-base": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/communication-engine": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/core": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/data-context": patch
"@memberjunction/data-context-server": patch
"@memberjunction/entity-communications-base": patch
"@memberjunction/entity-communications-server": patch
"@memberjunction/entity-documents": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/global": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/record-cloning": patch
"@memberjunction/search-engine": patch
"@memberjunction/server": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/templates": patch
"@memberjunction/templates-base-types": patch
---

Field-level security close-out: a denied value never reaches anyone the rule does not entitle.

The rule is no longer "API output is the perimeter". A denied value may sit in server memory, but must never reach a principal the rule does not entitle: an API caller, an LLM's context, a message recipient, or a reader of a stored artifact such as an embedding, tag or log. See the rewritten `guides/FIELD_LEVEL_SECURITY_GUIDE.md`, including its new §6 developer checklist, the `.claude/rules/field-security.md` rule and the `mj-field-security` skill.

**An entity object never holds a value its user is denied.** Every hydration path (`Load`, `LoadFromData`, `Hydrate`, RunView `entity_object`, the IS-A parent merge, `SaveEntityGraph` results and the re-read after `Save()`) leaves a restricted user's denied fields `NotLoaded`. `GetAll()`, `To()`, `GetDataObject(JSON)`, `Fields[].Value` and `JSON.stringify(entity)` are therefore correct without changes. System-user and unrestricted objects keep the zero-copy fast path; shared cache rows are never modified. New: `ProjectEntityValuesForUser` / `ProjectEntityValueRowsForUser` (the one output projection every transport uses), `AssertClientInputWritableForUser`, and `BaseEntity.IsFieldReadableByActiveUser`.

**Work on behalf of a user runs as that user.**
- Entity communication previews and sends read recipients and related data as the sender (previously the system user, which bypassed row-level security, entity permissions and field security). A merge field the sender cannot read renders empty.
- Templates render with the user of each render instead of the first caller's.
- Entity actions load their record as the caller; `execute-agent` projects engine-cached notes and examples.
- A2A runs entity work as the authenticated caller, refuses to run with no resolvable user instead of picking the first cached user, and keeps each task private to its caller.
- New `UserScopedCacheKey` (`@memberjunction/global`). The agent data-source cache, the Entity Document placeholder cache, the in-memory vector index cache and the IS-A subtype lookup cache key on the user, so one user's rows are never served to another.

**Every transport projects its output and gates its input:** GraphQL CRUD, transaction groups (including the update delta), `SaveEntityGraph`, File, Query and User View resolvers, entity-action results, agent-run and test-run streams, REST, MCP and A2A.

**Behaviour changes to be aware of:**
- **Client input naming a field the caller cannot read, or no field at all, is rejected** (`Field 'X' cannot be written on entity 'Y'.`), for callers denied anything on the entity. It was silently dropped before. Well-behaved clients never send such keys.
- **REST `runView` / `runViews` always return `simple` rows**, whatever `ResultType` the request asks for.
- **CloudEvents and the debug log carry only the primary key and changed field names** for an entity with field security, never values. Cache-invalidation broadcasts never carry row data for such an entity.
- **A field-security refusal throws a `FieldSecurityError` from the provider's RunView path** instead of returning `Success: false`; in `RunViews`, only the refused item fails.
- **Data Context SQL and query items always re-run**, and entity items whose entity has field security (or for which the reader has a row filter) ignore saved `DataJSON` and re-run for the reader.
- Non-canonical Access spellings (`'deny'`, `'ALLOW'`) are normalized on save.

**One parse-based gate on every clause a view runs.** New `FieldSecuritySQLGate` resolves identifiers from the dialect-aware SQL scanner, so names in strings and comments are ignored and quoted, bracketed or look-alike spellings are caught. The provider applies it to `ExtraFilter`, `OrderBy`, aggregates, `OverrideExcludeFilter`, search terms spliced into SQL, and a saved view's stored `WhereClause`/`OrderByClause` (including `CustomWhereClause` views and `ViewID`-only requests). Whole-row constructs (`SELECT *`, `alias.*`, `FOR JSON/XML`, `CHECKSUM(*)`, `NATURAL JOIN`) and unreadable SQL are refused only for callers denied something. For those callers a column that does not exist produces the same error as a denied one. This closes the saved-view filter residual.

**Saved queries enforce field security.** The SQL a run will execute is checked against the caller's denials in every clause, with the entities taken from the SQL rather than `QueryEntities`; `SELECT *` and untraceable columns fail closed. A query's role list (`MJ: Query Permissions`) still authorizes on its own. Agent SQL artifacts and Data Context SQL items go through the ad-hoc SQL authorizer on the read-only connection.

**Caches.** Server RunView cache slots are segmented by field-security fingerprint, like row-level security, and read-time projection checks every row. A browser's cached view results are answered "stale" when the user's field-security key has changed.

**Datasets** never select a caller's denied columns, project rows on cache hits and misses, and gate item filters. **Record Changes** payloads on `ViewID`-only RunViews are projected per row.

**Derived indexes.** Entity Document template data, vector display metadata, Entity Record Document text, duplicate-detection text and autotagging content leave out any field not readable by every role. Search results, external vector metadata and duplicate candidates are projected per reader. **Admins must re-index** after upgrading: re-vectorize Entity Documents on FLS entities (rebuild external stores such as Pinecone), re-run Entity autotagging, and review tags produced from restricted text.

**IS-A children inherit their ancestors' field rules.** `EntityInfo.FieldLevelSecurityApplies` (new) is true when the entity's own flag or any ancestor's is on, and every runtime gate uses it. Denied sets inherit, but only on the child's mirrors of parent fields. `ParentChain` caches only a complete chain. A subtype selector reaching a denied field gives "no subtype" instead of throwing.

**Denied-set memo** keys on per-entity generations (self and ancestors) and the user's roles instead of counts; `EntityInfo.InvalidateFieldSecurityCache()` (new) is for in-place rule edits.

**Configuration guards.** Re-pointing a rule's `RoleID` or `EntityFieldID` is judged against the target it leaves as well as the one it lands on; `MJ: User Roles` updates that move a system-user assignment run the removal guard; the reconciler skips a refused orphan delete instead of aborting. `BaseEngine` logs once when it loads an entity with field security.

**Source guard.** `check:guards` gains `FieldSecurityEgressCompliance`, which flags `.GetAll(`, `.GetDataObject(`, `.GetDataObjectJSON(` and `JSON.stringify(<entity>)` in MJServer resolvers and REST, the MCP and A2A servers and actions unless the line carries `// fls-guard: <reason>`.
