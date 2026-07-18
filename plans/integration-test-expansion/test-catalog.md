# Integration Test Expansion — Candidate Catalog

Companion to **[README.md](README.md)**. Full enumeration of candidate checks from the 7-cluster adversarial repo sweep. Each is a proposed **new** check (existing coverage explicitly excluded).

**Legend** — Tier: `DET` deterministic (blocking gate) · `MUT` mutation (self-cleaning, gated CI lane) · `LIVE` live-model (`RUN_AGENT_TESTS`) · `PG` needs PostgreSQL in matrix. Priority: **P0** unblock/highest-severity · **P1** core integrity+security · **P2** broad expansion · **P3** specialized.

**Transport (per §3a of the plan): default is CLIENT — over the GraphQL wire via `GraphQLDataProvider`.** Every check below runs client-first UNLESS marked with a ⚙︎ **SERVER** tag (in-process only, because there's no client surface or the wire can't observe it) or a ⇄ **REMOTE-OP** tag (needs a new Remote Operation added, then invoked client-side — the preferred way to reach an otherwise server-only capability). Unmarked = plain client transport. All client-transport checks require a running MJAPI (Track A / A8).

---

## Domain 0 — Exhaustive RunView + RunQuery feature coverage  *(new bundles: `runview-matrix`, `runview-features`, `runquery-catalog`, `runquery-features`)*

The two most-used data primitives get **exhaustive, parameterized coverage** — every feature of `RunViewParams` exercised, and every catalog query run with valid parameter permutations. All **client-first over GraphQL**. Per Amith: pull full-width (no `MaxRows` shortcut on the sweeps) and cover aggregates + every other feature per entity. The per-entity sweep loads all 379 `EntityInfo` once, then loops.

### 0a. `runview-matrix` — every RunViewParams feature, swept across all 379 entities
Each row is one authored check × N entities (conditional features skip entities that can't support them — recorded as `Skipped`, per A1, never silent-pass).

| ID | Feature under test | Assertion per entity | Applies to | Tier |
|---|---|---|---|---|
| RV1 | **Full-width read** (`ResultType:'simple'`, no Fields) | Returns all rows; every column in `EntityInfo.Fields` present; row count == RV2 count | all | DET |
| RV2 | **`count_only`** | `TotalRowCount` populated, `Results` empty; matches RV1 length | all | DET |
| RV3 | **`entity_object`** | Results are real BaseEntity instances (`.Save`/`.Get` usable); Fields param ignored (full width) | all | DET |
| RV4 | **`Fields` projection (simple)** | `Fields:[firstNonPK]` returns that field **+ forced PK(s)**, nothing else | all | DET |
| RV5 | **`OrderBy` ASC/DESC** | Rows sorted by a sortable field asc, then desc; order actually differs | all w/ ≥1 orderable field | DET |
| RV6 | **Multi-column `OrderBy`** | `A ASC, B DESC` tie-break order correct | all w/ ≥2 fields | DET |
| RV7 | **`ExtraFilter` (simple predicate)** | `PK IS NOT NULL` returns all; an impossible predicate returns 0; a field-eq predicate returns the expected subset | all | DET |
| RV8 | **`ExtraFilter` injection-safe** | `;`/`--`/`DROP`/`UNION` in ExtraFilter rejected by `ValidateUserProvidedSQLClause` | all | DET |
| RV9 | **`UserSearchString`** | Search term LIKE-matches only entities' configured search fields; no-search-fields entity → clean no-op or documented behavior | entities w/ search-enabled fields | DET |
| RV10 | **`MaxRows`** | `MaxRows:5` → ≤5 rows | all w/ ≥6 rows (else skip) | DET |
| RV11 | **`IgnoreMaxRows`** | Overrides entity `UserViewMaxRows`, returns full set | entities w/ `UserViewMaxRows` set | DET |
| RV12 | **`StartRow` OFFSET pagination** | Paged walk union == full set, no dup/gap | all w/ ≥2 pages | DET |
| RV13 | **`AfterKey` keyset pagination** | Keyset walk returns every row once; end-signal on short page | single-column orderable PK entities | DET |
| RV14 | **`AfterKey` guard** | Composite-PK / non-PK OrderBy / +StartRow → `AfterKeyNotSupportedError` w/ right reason | composite-PK + a few others | DET |
| RV15 | **`Aggregates` COUNT(*)** | `[COUNT(*)]` == RV2 TotalRowCount; unaffected by MaxRows | all | DET |
| RV16 | **`Aggregates` numeric (SUM/AVG/MIN/MAX)** | Over a numeric field, matches an independent computation; `alias` honored | entities w/ ≥1 numeric field | DET |
| RV17 | **`Aggregates` + ExtraFilter + RLS** | Aggregate reflects WHERE + RLS scope, not the whole table | all (scoped-user leg where RLS applies) | DET |
| RV18 | **`CacheLocal` hit/miss** | Cold miss populates slot; warm hit returns byte-identical without server exec | all (client cache observable) | DET |
| RV19 | **`BypassCache`** | Skips cache read+write even with a warm slot | all | DET |
| RV20 | **`CacheLocalTTL`** | Slot serves within TTL, re-executes after expiry | representative subset | DET |
| RV21 | **`RunViews` (batch)** | N entities in one batch call each project to their own params; mixed hit/miss | representative subset | DET |
| RV22 | **`PlatformSQL` ExtraFilter/OrderBy** | Dialect-specific SQL variant applied on the matching platform, ignored on the other | entities used cross-platform | DET/PG |
| RV23 | **Exclude-prior-run** (`ExcludeUserViewRunID`, `ExcludeDataFromAllPriorViewRuns`, `OverrideExcludeFilter`) | A saved run's rows are excluded on re-run; override filter negates specific IDs | entities w/ a saved view + run | MUT |
| RV24 | **`SaveViewResults`** | Run persists a `MJ: User View Run` + detail rows matching the result set | entities w/ a saved view | MUT |
| RV25 | **`ForceAuditLog` / `AuditLogDescription`** | A view run writes an Audit Log row with the description even when the entity's default logging is off | all (one representative) | MUT |

### 0b. `runview-features` — cross-feature interaction & edge cases (targeted, not swept)
- Fields + OrderBy on a field NOT in Fields (must still sort correctly / include the sort column server-side).
- count_only + Aggregates together. Fields projection over the wire matches the `\|f:` client fingerprint slot (ties to client-cache).
- MaxRows + Aggregates (aggregate ignores MaxRows). StartRow past the end → empty, no error. Empty entity (0 rows) across every ResultType.
- ExtraFilter with a value containing an apostrophe / unicode / very long string (binding safety, not injection).

### 0c. `runquery-catalog` — run every catalog query (20 queries: 4 no-param, 16 parameterized)
Enumerate `QueryEngine.Instance.Queries` at runtime (so newly-seeded queries auto-cover). Zero rows is a **PASS**, not a failure.

| ID | Check | Tier | Anchor |
|---|---|---|---|
| RQ-C1 | Every no-param query (Active Users, User Activity Summary, Server Installed Version History, Tag Aggregates) → `Success=true`, `Array.isArray(Results)`, columns==row keys | DET | catalog SQL vs current schema (view-drift risk) |
| RQ-C2 | Every REQUIRED-param query called with `{}` → `Success=false` + non-empty `ErrorMessage`, **never a 500/throw** | DET | queryParameterProcessor.ts:133 + throwOnUndefined |
| RQ-C3 | Every parameterized query with derived-valid params (from live `vwEntities`/real IDs) → clean result or clean-empty | DET | (16 param'd queries) |
| RQ-C4 | ExternalChangeDetection/Geo raw-identifier queries fed **real** SchemaName/BaseView/EntityID from `vwEntities` → success OR clean SQL error (no unhandled throw) | DET | raw `{{BaseView}}` interpolation hotspot |
| RQ-C5 | `AppliedParameters` JSON echoes the supplied keys on success | DET | QueryResolver.ts:247 |
| RQ-C6 | Query-param metadata parity: `QueryEngine` param count per query == baseline seed count (**guards bug: params not round-tripped to dotfiles**) | DET | Baseline.sql:47795 |

### 0d. `runquery-params` — parameter permutation (focus on the two all-optional queries #14/#15)
| ID | Check | Tier |
|---|---|---|
| RQ-P1 | #14/#15 with `{}` → success, all `{% if %}` blocks omitted (baseline set) | DET |
| RQ-P2 | Vary each optional param independently → success; filtered count ≤ unfiltered | DET |
| RQ-P3 | Full 6-param combo → success (no clause interaction breaks SQL) | DET |
| RQ-P4 | number coercion: `MinRating:"3"` accepted, `"abc"` → clean "must be a number" | DET |
| RQ-P5 | date coercion: invalid date → clean "must be a valid date" | DET |
| RQ-P6 | array coercion: `versionIds` JSON-string accepted, scalar → clean array error | DET |
| RQ-P7 | **`MinRating:0` truthiness trap** — `{% if MinRating %}` treats 0 as falsy → clause skipped (assert documented behavior) | DET |
| RQ-P8 | unknown param `{bogus:1}` → clean "Unknown parameter: 'bogus'" | DET |

### 0e. `runquery-features` — RunQuery feature surface + injection gates
| ID | Check | Tier | Anchor |
|---|---|---|---|
| RQ-F1 | QueryID ≡ QueryName ≡ QueryName+CategoryPath return identical rows; **`CategoryPath='MJ/Tags'` does NOT match** (pins the category-name-not-path behavior) | DET | QueryResolver.ts:167 |
| RQ-F2 | CategoryPath/CategoryID disambiguates same-named queries | DET | findQuery:163 |
| RQ-F3 | `MaxRows:5` → `RowCount≤5`, `TotalRowCount≥RowCount` | DET | SQLServerDataProvider:703 |
| RQ-F4 | `StartRow`+`MaxRows` page is disjoint from page 1; `PageNumber`/`PageSize` set | DET | :707 |
| RQ-F5 | **Injection — quote:** param `"O'Brien'); DROP TABLE x--"` → success, 0 rows, no injection | DET | sqlString:98 |
| RQ-F6 | **Injection — LIKE:** `SearchText:"50%_x"` → literal match, `%`/`_` escaped | DET | sqlLikeContains:300 |
| RQ-F7 | **Injection — raw identifier:** `BaseView:"x; DROP TABLE y"` → clean SQL error, no DDL executes | DET | raw interpolation + read-only pool |
| RQ-F8 | **Injection — the `since` hole:** `GetConversationsForMemoryManager` `since:"2024-01-01'; DROP…"` → contained (guards bug #where `since` is raw-quoted) | DET | get-conversations-for-memory-manager.sql |
| RQ-F9 | ad-hoc `SELECT 1` passes; RQ-F10 ad-hoc `UPDATE…` rejected (no write); RQ-F11 ad-hoc paging | DET | AdhocQueryResolver:53 |
| RQ-F12 | `Enrichment:{EnricherKey:'nonexistent'}` → success, un-enriched rows, no error | DET | runQuery.ts:96-111 |
| RQ-F13 | batch `RunQueries([valid, missing-required])` → per-item Success independent, batch succeeds | DET | QueryResolver.ts:412 |
| RQ-F14 | `CacheLocal`+TTL: 2nd identical run `CacheHit=true`, zero exec (overlaps `runquery-cache` Q2) | MUT | runQuery cache |

---

## Domain 1 — Metadata ↔ DB Consistency Audit  *(new bundle: `metadata-consistency`)*
Read-only SELECTs vs `__mj` views + `sys.*`/`information_schema`. Zero fixtures/teardown. **Highest value-per-effort.** Each check parameterizes across all 379 entities.

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| MC1 | Every non-virtual entity with `BaseViewGenerated=1` has its `BaseView` in `sys.objects` | DET | P0 | sql_codegen.ts:713 |
| MC2 | Every entity with `Allow*API`+`sp*Generated` has spCreate/spUpdate/spDelete present | DET | P0 | manage-metadata |
| MC3 | CHECK-constraint values == `EntityFieldValue` rows == generated TS union (alphabetized) | DET | P0 | manage-metadata.ts:4103/4349 |
| MC4 | Every FK column has its `IDX_AUTO_MJ_FKEY_{Table}_{Col}` (≤128) index | DET | P0 | SQLServerCodeGen:496 |
| MC5 | Field sequences gapless, start at 1, match physical base-view column order (lift `system_integrity`) | DET | P0 | system_integrity.ts:102 |
| MC6 | Every entity field has an extended-property/`MS_Description` description | DET | P1 | manage-metadata.ts:3962 |
| MC7 | No orphan metadata: every `DriverClass` string in AI/action/etc. metadata resolves via ClassFactory | DET | P1 | (cross AI stack) |
| MC8 | `SchemaInfo.CanonicalSchemaName` present & casing-correct per dialect | DET | P1 | SQLDialect:154/195 |

## Domain 2 — Core Data Write-Side & Transactions  *(new bundles: `entity-writes`, `transaction-groups`, `class-resolution`)*

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| CD1 | Record-change fidelity: create+2 updates → N RecordChanges w/ correct before/after JSON; `Record Changes` entity writes none | MUT | P1 | SQLServerDataProvider.ts:1204,1464 |
| CD2 | Virtual-field save-capture order: base+virtual columns return correct values (no `@ResultTable` skew) | MUT | P1 | SQLServerDataProvider.ts:980-1040 |
| CD3 | Keyset pagination completeness: 500 rows, AfterKey pages, union==full, no dup PK, `>` boundary | MUT | P1 | runView.ts:271 |
| CD4 | Keyset guardrail errors: CompositePK / StartRowConflict / IncompatibleOrderBy reason codes | DET | P1 | runView.ts:13-18 |
| CD5 | Linger-invalidation-after-save: save within `DedupLingerMs` drops the linger entry | MUT | P1 | providerBase.ts:327,346-379 |
| CD6 | **[break]** ViewID/ViewName-only RunView NOT drop-invalidated on save (stale hole — pin behavior) | MUT | P2 | providerBase.ts:381-385 |
| CD7 | RLS-on-write: unauthorized create/update denied w/ ambiguous "not found or access denied" | MUT | P1 | databaseProviderBase.ts:1324-1345 |
| CD8 | TransactionGroup rollback integrity: item 3 errors → items 1-2 rolled back + in-memory state restored | MUT | P1 | SQLServerTransactionGroup.ts:10 |
| CD9 | TransactionGroup variable dependency: parent PK threads to child FK via TransactionVariable | MUT | P1 | SQLServerTransactionGroup.ts:22-67 |
| CD10 | ClassFactory resolution: `GetEntityObject('MJ: Tags')` yields `MJTagEntityServer` on real server; override runs | DET | P1 | ClassFactory.ts:154-188 |
| CD11 | UUID case-insensitive FK round-trip: uppercase FK saved, lowercase RunView filter finds it | MUT | P1 | UUIDUtils.ts:48 |
| CD12 | datetimeoffset round-trip: non-UTC offset save/load byte-equal | MUT | P2 | SQLServerDataProvider.ts:2112 |
| CD13 | **[pin]** save-clobbers-concurrent-edit: server ignores SkipOldValuesCheck (last-write-wins by design) | MUT | P2 | interfaces.ts:306-311 |
| CD14 | Dataset invalidation on member mutation: saving entity X flips dataset-over-X `UpToDate` | MUT | P2 | (dataset-cache gap) |
| CD15 | FullTextSearch RLS-filtering + empty-catalog behavior | MUT | P3 | providerBase.ts:1026 |

## Domain 3 — Security & Permissions  *(new bundles: `permission-engine`, `scope-enforcement`, `subscription-isolation`)*

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| SEC1 | **TransactionGroup scope bypass**: `view:run`-only key attempting Create via `ExecuteTransactionGroup` → rejected (or document escalation) | MUT | P0 | TransactionGroupResolver.ts:81 |
| SEC2 | PermissionEngine domain fan-out: Dashboard+AIAgent+Resource grants to user B resolve correctly across all domains; `[]` for stranger; one throwing provider doesn't crash aggregate | MUT | P1 | PermissionEngine.ts:150,178 |
| SEC3 | Scope deny-precedence e2e: Allow+Deny at equal priority → Deny wins through a real resolver | MUT | P1 | ScopeEvaluator.ts:183-188 |
| SEC4 | App-ceiling caps key scope: key grants `agent:execute` but bound app ceiling excludes → denied | MUT | P1 | ScopeEvaluator.ts:89 |
| SEC5 | RLS-cache cross-user leak: user A populates cache, user B stricter predicate gets none of A-only rows | MUT | P1 | (rls+cache intersection) |
| SEC6 | Subscription channel isolation: user B on A's channelId/sessionId receives nothing (or flag leak) | MUT | P1 | ExecuteRemoteOperationResolver.ts:151 |
| SEC7 | Cache-invalidation broadcast scope: mutated `RecordData` broadcast to all sockets regardless of tenant (characterize) | MUT | P2 | CacheInvalidationResolver.ts:47 |
| SEC8 | `@RequireSystemUser` boundary: normal user → AuthorizationError; system key → allowed | MUT | P1 | RequireSystemUser.ts:21 |
| SEC9 | Agent-permission dual-path default: helper (open, View+Run) vs unified provider (closed, `[]`) on zero-grant agent; converge after grant | MUT | P1 | AIAgentPermissionHelper |
| SEC10 | API-key full_access bypass + usage-log hygiene: probe writes no log row, real op does | MUT | P2 | ResolverBase.ts:679-692 |
| SEC11 | AISkill/AIAgent permission hierarchy: Delete⇒Edit⇒Run⇒View collapse + role-grant via UserRoles | DET | P1 | AISkillPermissionHelper:86-121 |
| SEC12 | RemoteOperation ShouldRegenerate + approval reset: regen resets `CodeApprovalStatus=Pending` (re-review gate) | MUT | P2 | MJRemoteOperationEntityServer:84 |
| SEC13 | SQLExpressionValidator `\bXP_\b`/`\bSP_\b` boundary: does `xp_cmdshell` slip through? | DET | P1 | SQLExpressionValidator.ts:183 |
| SEC14 | SQLExpressionValidator full_query trailing `;--comment` allowed but mid-`;` rejected | DET | P2 | SQLExpressionValidator.ts:308 |
| SEC15 | Magic-link single-use CAS race: N concurrent `/redeem` of 1-use link → exactly one wins | MUT | P3 | magicLinkCore buildConsumeInviteSQL |
| SEC16 | Magic-link privilege confinement: guest can't mint invites, grant privileged role, or read outside scope | MUT | P3 | canIssueInvites:57 |
| SEC17 | OAuth state cross-user 403: user B can't `/status`/`/exchange` A's state (no real IdP needed) | MUT | P3 | OAuthCallbackHandler:293,495 |

## Domain 4 — AI Stack Deterministic Seams  *(new bundles: `ai-cost`, `ai-permissions`, `agent-memory`, `ai-embeddings`, `ai-providers`, `agent-loop-standin`)*
**Foundational enabler:** register a scripted `@RegisterClass(BaseLLM,'ItTestLLM')` driver + fixture model row → converts live-only invariants to DET.

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| AI1 | Prompt-run cost accounting + parent rollup: PerMillion/Thousand normalization, no-recompute when Cost>0, cache-tokens-still-cost, child→parent sum | MUT | P1 | MJAIPromptRunEntityServer:29-74 |
| AI2 | AISkillPermission hierarchy beyond AS11-16 (canView/canEdit/role grants) | DET | P1 | (see SEC11) |
| AI3 | AIAgentPermissionHelper e2e (zero coverage today) | MUT | P1 | AIAgentPermissionHelper |
| AI4 | Memory-write guard pipeline: type-reject, per-run cap, scope clamp, near-dup (LocalEmbeddings), idempotency, persists `Provisional` | MUT | P1 | MemoryWriteManager:148,403 |
| AI5 | Skill requested-path enforcement boundary: smuggled `requestedSkillIDs` rejected by re-check | DET | P2 | base-agent.ts:3987 |
| AI6 | Persisted-embedding pattern (Note/Example/Query/Component/Tag): vector persists w/ correct dims, updates on re-save, empty degrades | MUT | P1 | MJAIAgentNoteEntityServer:24-38 |
| AI7 | Provider registration/capability parity: every seed DriverClass resolves; capability getters stable | DET | P1 | Providers/*/models/*.ts |
| AI8 | Model-selection determinism: `selectModel` picks by PowerRank/priority/config-chain (no exec) | DET | P2 | AIPromptRunner.selectModel |
| AI9 | Credential failover ladder (stand-in LLM): walks priorities 1-4, no double-bill in rollup | DET | P2 | AIPromptRunner:392,1162 |
| AI10 | Deterministic agent loop (stand-in LLM): every run step reaches terminal + CompletedAt | DET | P2 | ai-verify.ts:96 |
| AI11 | Prompt output-validation Strict retry (stand-in): malformed→valid, retries to MaxRetries then fails | DET | P2 | AIPromptRunner:972,1004 |
| AI12 | HITL pause-side + resume linkage: request sets `AwaitingFeedback`; save Requested→Approved sets `ResumingAgentRunID` once | MUT | P2 | MJAIAgentRequestEntityServer:100-115 |
| AI13 | AIEngine resolvers: `GetActiveModelCost` Realtime-vs-Batch, single default preset, `GetHighestPowerLLM` | DET | P2 | BaseAIEngine.ts:539,806 |
| AI14 | EntityVectorSyncer batch integrity: every source row → persisted embedding, no dropped rows | MUT | P2 | entityVectorSync.ts:78 |
| AI15 | DefaultAgentResolver 4-step precedence over real Application AgentSettings + legacy Setting → Sage | DET | P2 | DefaultAgentResolver.ts:8-19 |

## Domain 5 — Actions & Background Processing  *(new bundles: `rsp-lifecycle`, `actions-pipeline`, `entity-actions`, `scheduling-concurrency`)*
Deterministic via `ArraySource` + `FunctionRecordProcessor`.

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| AP1 | **RSP resume-from-cursor: no dup / no gap** (marquee unproven invariant) | MUT | P1 | RecordSetProcessor.ts:144 |
| AP2 | Scheduled-job double-execution lease race: 2 concurrent `ExecuteScheduledJob`, exactly one runs | MUT | P1 | ScheduledJobEngine tryAcquireLock:1160 |
| AP3 | **[break]** ConcurrencyMode=Queue orphan probe: queued run never terminalizes (`Running` forever) | MUT | P1 | ScheduledJobEngine:1497 |
| AP4 | RSP circuit-breaker exact boundary: errorRate==threshold does NOT trip (`>` not `>=`) | MUT | P2 | RecordSetProcessor.ts:169 |
| AP5 | RSP circuit-breaker granularity==batch: batchSize>=total finishes Processed==Total before Failed | MUT | P2 | RecordSetProcessor.ts:169 |
| AP6 | Action pipeline e2e via `RunAction`: resolves result code + writes complete ActionExecutionLog | MUT | P1 | ActionEngine.ts:111 |
| AP7 | Action log written even when action throws (fire-and-forget catch) | MUT | P2 | ActionEngine.ts:341 |
| AP8 | **[pin]** Action param-validation is per-action; base ValidateInputs/RunSingleFilter are stubs | MUT | P2 | ActionEngine.ts:280,303 |
| AP9 | RSP budget-gate `onAfterBatch` pause w/ 'Auto-paused:' msg; throwing hook swallowed | MUT | P2 | RecordSetProcessor.ts:160 |
| AP10 | RSP maxRecords hard cap (trim boundary off-by-one) | MUT | P2 | RecordSetProcessor.ts:139 |
| AP11 | RSP pause handshake halts a live loop at next checkpoint (not just flag toggle) | MUT | P2 | GenericProcessRunTracker:108 |
| AP12 | Generic WriteBackProcessor dry-run persists nothing (Action/Infer path, not just FieldRules) | MUT | P2 | writeBack.ts:65 |
| AP13 | Entity-action invocation dispatch by InvocationType; invalid type throws (flag inconsistency) | MUT | P2 | EntityActionEngine.ts:71 |
| AP14 | OnChange result-hash suppresses identical results (no `evaluatedAt` leak into ResultContent) | MUT | P2 | UserRoutineDispatcher:305 |
| AP15 | Integration change-detection core: `computeContentHash` stable across key-order/Date; `mostRecentWinner` | DET | P2 | ContentHash.ts:30 |

## Domain 6 — Entity-Server Invariants (long tail)  *(new bundle: `entity-server-invariants`)*
The untested majority (~30 of ~40 server subclasses). Mostly DET (pure validators) with fake provider/RunView.

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| ES1 | Tag IsGlobal⊕TagScope rejection (both sides) + 5-table FK delete sweep | MUT | P2 | MJTagEntityServer:9-43 |
| ES2 | VectorIndex `sanitizeIndexName` (pure): lowercase/hyphen/45-cap/empty-throw | DET | P2 | MJVectorIndexEntityServer:47 |
| ES3 | Application slug trio: generateSlug / ensureUniqueSlug(-2,-3) / calculateSequenceFromDefault | DET | P2 | MJApplicationEntityServer:110-173 |
| ES4 | DuplicateRun normalizeThreshold (≥1.0→fallback) + fire-once detection guard | MUT | P2 | MJDuplicateRunEntityServer:29-174 |
| ES5 | ConversationDetailAttachment MIME gate rejects BEFORE artifact rows written; skipped on update | MUT | P2 | MJConversationDetailAttachmentEntityServer:39 |
| ES6 | CompanyIntegration schema-refresh pipeline fires only on IsActive false→true | MUT | P2 | MJCompanyIntegrationEntityServer:103 |
| ES7 | EntityPermission static queue: AddToQueue dedup + debounce reset + ClearQueue-on-success | DET | P2 | MJEntityPermissionEntityServer:15 |
| ES8 | ConversationDetail OriginalMessageChanged only on edit-existing w/ dirty Message | DET | P3 | MJConversationDetailEntityServer:13 |
| ES9 | TemplateContent syncTemplateParameters case-insensitive add/update/remove diff | MUT | P3 | MJTemplateContentEntityServer:96 |
| ES10 | SearchScope auto-grant creator Manage on new scope; no re-grant on updates | MUT | P3 | MJSearchScopeEntityServer:30 |

## Domain 7 — Communication / Templates  *(new bundle: `communication`, `templates`)*
**Coordinate with disabled unit-suite backlog — some cheaper as enabled unit tests.**

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| CT1 | Communication preview-no-send: fake provider via ClassFactory, `previewOnly:true` never calls real send; per-recipient isolation | MUT | P2 | Communication/Engine.ts:94 |
| CT2 | GetProvider throws on unregistered/base-class provider | DET | P3 | Communication/Engine.ts:59 |
| CT3 | ProcessedMessage template-content selection matrix: Body needs Text, HTML falls back, Subject needs HTML | DET | P3 | BaseProvider.ts:88 |
| CT4 | SendToAudience composite-PK skip w/ reason + single-quote ID escaping in IN-list | DET | P2 | SendToAudience.ts:105,124 |
| CT5 | NotificationEngine resolveDeliveryChannels branch matrix (force > opt-out > pref/default) | DET | P3 | NotificationEngine.ts:146 |
| CT6 | Template render injection: `<script>`/`{{7*7}}` in contextData neutralized (autoescape); param-validation on/off | MUT | P2 | TemplateEngine.ts:92,205 |
| CT7 | mergeDefaultValues precedence + JSON-type parse fallback | DET | P3 | TemplateEngine.ts:345 |

## Domain 8 — PostgreSQL Parity  *(new bundle: `pg-parity` — needs PG in harness matrix)*

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| PG1 | Core CRUD + RunView round-trip parity vs SQL Server | PG/MUT | P3 | PostgreSQLDataProvider |
| PG2 | PascalCase identifier quoting (unquoted-fold-to-lowercase trap) | PG/MUT | P3 | 811065e6bc |
| PG3 | Multi-word composite-PK param naming (#3112 regression) | PG/MUT | P3 | f4dce92cd4 |
| PG4 | UUID/bool/datetimeoffset value round-trip identical to SS | PG/MUT | P3 | queryParameterProcessor |
| PG5 | AfterKey keyset + StartRow parity | PG/MUT | P3 | PostgreSQLDataProvider |

## Domain 9 — Metadata Tooling & Lifecycle  *(new bundle: `metadata-sync`, `codegen-determinism`, `open-app-lifecycle`)*

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| MT1 | MetadataSync pull→push round-trip is a no-op (checksums unchanged) | MUT | P3 | sync-engine.ts |
| MT2 | Sync push partial-failure rolls back ALL rows (atomic) | MUT | P3 | transaction-manager.ts:102 |
| MT3 | @lookup case-insensitive incl. PG uuid `LOWER()` bypass | DET | P3 | sync-engine.ts:646-668 |
| MT4 | CodeGen idempotent: 2nd run against unchanged DB → zero metadata writes | MUT | P2 | nextAvailableEntityFieldSequence:359 |
| MT5 | CodeGen output byte-identical across runs (git-clean assert) | MUT | P3 | (#3117) |
| MT6 | Manifest generation deterministic + topo-correct (subclass before dependent) | DET | P2 | GenerateClassRegistrationsManifest:799 |
| MT7 | OpenApp reinstall idempotency full graph (install→remove→reinstall, same GUIDs) | MUT | P3 | install-orchestrator.ts:276 |
| MT8 | sqlReadOnlyScreen injection vectors (stacked-write/UNION/CTE-INSERT/comment) all rejected | DET | P2 | sqlReadOnlyScreen.ts:91-137 |
| MT9 | Encryption round-trip + fail-closed (EnvVar source, no network) | DET | P2 | EncryptionKeySourceBase.ts:146 |

## Domain 10 — Realtime / Predictive Studio (deterministic legs)

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| RT1 | Realtime Loopback session-bridge persistence + janitor: idle-reap routes through stop, finalizer fires, live session NOT reaped (injected clock) | MUT | P3 | ai-bridge-engine.ts:86-110 |
| PS6 | Leakage guard blocks promotion: dominance-flagged model refused without sign-off, saves only Status | MUT | P1 | promote-model.gate.ts:4-55 |
| PS7 | Experiment orchestrator wave loop persistence (injected trainer): waves/iterations/leaderboard/prune/budget-gate | MUT | P2 | experiment-orchestrator.ts:19 |
| PS8 | FeatureAssembly fit-once/as-of: recipe emitted, never fit in TS; label-derived cols denied; vision-on-own-image allowed | MUT | P2 | feature-assembly-executor.ts:14 |
| PS9 | MLModelInferenceProcessor scoring via InMemoryArtifactLoader (no sidecar) | MUT | P2 | ml-model-inference-processor |

## Domain 11 — Viewing System  *(new bundle: `view-execution`)*
`ng-entity-viewer` builds only thin `RunViewParams`; the real logic (filter-JSON→SQL, sort/column config, pagination, RLS combination, projection) lives in the client-data layer + server and is fully drivable headless over GraphQL. **Boundary rule: `RunViewParams` in → rows/order/count/projection out = headless; pixels/DOM/interaction = Computer-Use UI.** All plain-client unless noted.

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| V1 | Dynamic `{EntityName,ExtraFilter}` RunView returns exactly the matching rows (wire) | DET | P1 | GenericDatabaseProvider.ts:1553 |
| V2 | Filter-JSON compiles to expected WHERE (nested groups parenthesized, ops/quoting) | DET | P1 | MJUserViewEntityExtended.ts:651-746 |
| V3 | ExtraFilter injection-safe: `;`/`--`/DROP/UNION rejected; benign substrings in literals pass | DET | P1 | databaseProviderBase.ts:983 |
| V4 | Fields projection returns subset **plus PK**, never extra columns, over the wire | DET | P1 | GenericDatabaseProvider.ts:1807-1840 |
| V5 | Saved view hidden column excluded from projection; non-hidden present | MUT | P2 | MJUserViewEntityExtended.ts:49-73 |
| V6 | Saved multi-column sort round-trips (SortState → OrderByClause → ordered rows) | MUT | P2 | MJUserViewEntityExtended.ts:102-124 |
| V7 | GridState.sortSettings legacy fallback orders correctly (empty SortState) | MUT | P2 | MJUserViewEntityExtended.ts:130-143 |
| V8 | Saved filter view (by ViewID) ≡ same clause as dynamic ExtraFilter (no compile/render drift) | MUT | P1 | runView.ts:592-617 |
| V9 | OFFSET pagination over a stable-sorted view: union==full, no dup/gap | DET | P1 | GenericDatabaseProvider.ts:1490 |
| V10 | Keyset AfterKey walk returns every row once; short final page signals end | DET | P1 | runView.ts:222-271 |
| V11 | Keyset on composite-PK throws `AfterKeyNotSupportedError(CompositePK)`, no silent OFFSET | DET | P1 | GenericDatabaseProvider.ts:1497 |
| V12 | MaxRows honored; IgnoreMaxRows full set; entity `UserViewMaxRows` fallback | DET | P2 | GenericDatabaseProvider.ts:1509-1526 |
| V13 | Aggregates unaffected by pagination; WHERE+RLS applied to aggregate | DET | P2 | runView.ts:329-346 |
| V14 | **View ExtraFilter AND-combines with RLS** — scoped user gets rows satisfying both, no leak/over-restrict (#1 view security invariant) | DET | P1 | GenericDatabaseProvider.ts:1588-1593 |
| V15 | Per-user view isolation: user B can't RunView A's private view; excluded from B's engine list | DET | P1 | UserViewEngine.ts:167; UserCanView:271-395 |
| V16 | Shared view (IsShared) executable by non-owner + appears in list; private not | MUT | P2 | UserViewEngine.ts:167 |
| V17 | Default view resolves per-user, never another user's `IsDefault` | MUT | P2 | UserViewEngine.ts:226 |
| V18 | Smart-filter view: server subclass regenerates non-empty WhereClause on save (blank client-side) | MUT/LIVE | P3 | MJUserViewEntityServer.server.ts:36-45 |

*Note: `MJUserViewEntityExtended`'s own compiled `WhereClause` is NOT run through `ValidateUserProvidedSQLClause` (only ExtraFilter is) — a documented sysadmin trust-boundary; note it in V3's rationale rather than "fixing" it.*

## Domain 12 — Applications (all shipped apps)  *(new bundles: `app-wiring`, `app-behavioral`, `openapp-lifecycle`)*
26 app defs (25 active); **all 79 nav DriverClass refs currently resolve — 0 orphans**, so the value is *locking that in* + catching 4 latent risks (generic-name collision, DefaultSequence conflicts, write-only slug uniqueness, OpenApp reinstall/canonical-schema drift). `app-wiring` parameterizes over every `Status='Active'` app.

| ID | Check | Tier | Pri | Anchor |
|---|---|---|---|---|
| G1 | Every Application row loads; `Metadata.Applications` parity with entity table | DET | P1 | md.Applications |
| G2 | `DefaultNavItems` valid JSON; each item has Label + DriverClass + `ResourceType='Custom'` | DET | P1 | metadata/applications/*.json |
| G3 | Exactly one `isDefault===true` per active app (missing = false) | DET | P1 | (nav contract) |
| G4 | DriverClass strings non-empty AND globally unique across all apps (collision risk #1) | DET | P1 | (Knowledge Hub generic names) |
| G5 | Each DriverClass has a `@RegisterClass(BaseResourceComponent,'X')` — orphan = broken app | DET | P1 | ⚙︎ **STATIC CI GREP GATE** (Angular registry not server-visible) |
| G6 | Global uniqueness of non-null `Path`; matches slug rules when `AutoUpdatePath` (risk #3) | DET | P1 | MJApplicationEntityServer:130-165 |
| G7 | Every `MJ: Application Entities` join row → real, readable entity (Integrations 12 / Testing 8) | DET | P1 | metadata/applications |
| G8 | Every `MJ: Application Roles` row's ApplicationID+RoleID resolve; CanAdmin⇒CanAccess | DET | P2 | metadata/application-roles |
| G9 | Every app-scoped `MJ: Application Settings` ApplicationID resolves | DET | P2 | metadata/application-settings |
| S1 | Data Explorer `AgentSettings.DefaultAgentID`→Sage + RelevantAgents all resolve | DET | P1 | DefaultAgentResolver.ts:113-123 |
| S2 | Global `Conversations.DefaultAgentID`→Sage resolves; `Sage` agent exists (resolver fallback) | DET | P1 | DefaultAgentResolver.ts:127-152 |
| S3 | DfNU fan-out: throwaway user gets exactly the 8 Active∧DefaultForNewUser apps, ordered, no dup Seq | MUT | P1 | UserInfoEngine.ts:1219-1283 |
| S4 | Flip test app DfNU false→true → `MJ: User Applications` created for all active users in one tx | MUT | P2 | MJApplicationEntityServer:194-278 |
| S5 | InstallApplication idempotent (single row); re-enable after disable gets fresh non-colliding Seq (#3027) | MUT | P2 | UserInfoEngine.ts:958-1078 |
| S6 | Two apps colliding Name under AutoUpdatePath → second Path gets `-2` suffix | MUT | P2 | MJApplicationEntityServer:130-165 |
| S7 | "Admin (Deprecated)" (Status=Deprecated, null nav) never returned as active/user app, never fans out | DET | P2 | application-manager.ts:258 |
| S8 | Integrations/Testing AppEntities carry `DefaultForNewUser=true` + contiguous Sequence 1..N | DET | P3 | metadata/applications |
| O1 | OpenApp install→teardown→reinstall: identical app/entity metadata, no dup Applications | MUT | P3 | ⇄ tests/open-app |
| O2 | Post-install: entities in OpenApp's `schema.name` have `CanonicalSchemaName` set → readable | DET | P3 | metadataSupportObjects.ts:590-594 |
| O3 | OpenApp-created apps/nav pass the G1–G8 wiring contract unchanged | DET | P3 | (inherits app-wiring) |

---

## Transport exceptions (the only non-client checks)

Everything not listed here runs **client-first over GraphQL** (BaseEntity CRUD, RunView/RunViews/RunQuery, and Remote Operations all marshal through `GraphQLDataProvider`). The exceptions:

**⚙︎ SERVER (in-process only — wire adds no value or can't observe it):**
- Existing `server-cache` bundle behavior (counting the *server's* `LocalCacheManager` reads via instrumented storage). The client-cache equivalent already runs client-side.
- CD2 internal `@ResultTable` base-before-virtual SQL-shape probe — but its *observable effect* (correct base+virtual values returned) is asserted **client-side**; only the internal shape assertion stays in-process.
- Provider-internal seams with no resolver: dedup/linger internal counters, `getEffectiveTimeout`-style harness internals.

**⇄ REMOTE-OP (add a Remote Operation, then invoke client-side — preferred over server-side):**
- MC1–MC8 metadata↔DB consistency audit (`sys.objects`/`information_schema`) → wrap in a "Schema Consistency Audit" Remote Operation returning structured results; the client invokes it over the wire and asserts. Bonus: makes the audit agent/workflow-invocable.
- AI4 memory-write guard pipeline — reachable client-side by triggering an agent run over the wire (`ExecuteAgent`), OR via a thin remote op around `MemoryWriteManager.executeWrite` for a tighter deterministic check.
- MT8 `sqlReadOnlyScreen` injection vectors — pure function; unit-test-adjacent, but a "Validate External SQL" remote op lets the client assert the firewall over the wire.
- SEC13/SEC14 `SQLExpressionValidator` boundary probes — pure functions; keep as fast unit tests unless a resolver already exposes the validation path.

**▣ STATIC CI GATE (not client, not remote-op — genuinely out of the wire's reach):**
- G5 DriverClass→Angular-component resolution. `@RegisterClass(BaseResourceComponent,'X')` registrations live in Angular bundles, not the server, so *no* MJAPI/GraphQL call can see them. This is a build-time grep gate over the source tree (does every nav item's DriverClass have a matching registration?), paired with the client-side G4 (metadata: non-empty + globally unique). This is the one dimension where the client is structurally blind — accept it as a static gate, don't force a remote-op.

**Note:** several "engine" checks (RecordSetProcessor, PermissionEngine, cost accounting) already have client surfaces — `RecordProcess.RunNow` is a Remote Operation, permissions are resolver-gated, prompt/agent runs execute via GraphQL mutations — so they are **client** by default, not exceptions.

---

## Rough count → path to 300+

| Domain | New checks | Predominant tier |
|---|---:|---|
| **0 RunView matrix (×379 entities)** | 25 | DET |
| **0 RunView feature interactions** | 6 | DET |
| **0 RunQuery catalog + params + features (×20 queries)** | 28 | DET |
| 1 Consistency audit | 8 (×379 entities of assertions) | DET |
| 2 Core write-side | 15 | MUT+DET |
| 3 Security/permissions | 17 | MUT |
| 4 AI deterministic | 15 | MUT+DET |
| 5 Actions/processing | 15 | MUT |
| 6 Entity-server | 10 | DET+MUT |
| 7 Communication/Templates | 7 | DET+MUT |
| 8 PG parity | 5 | PG |
| 9 Metadata tooling | 9 | MUT+DET |
| 10 Realtime/PS | 5 | MUT |
| 11 Viewing system | 18 | DET+MUT |
| 12 Applications (all shipped apps) | 20 | DET+MUT |
| **Total new** | **~203 logical checks** | — |

Combined with the current 152 → **~355 checks**. The heavily-parameterized ones dominate the *effective* assertion count: Domain 0's RunView matrix is 25 authored checks **× 379 entities**, RunQuery is 28 **× up to 20 queries**, the consistency audit (MC1–MC5) sweeps all 379 entities, and the app-wiring bundle (G1–G9) sweeps all 25 active apps — so the real executed-assertion count lands in the **many thousands**. Live-tier (Phase 4) adds semantic-quality checks on top.
