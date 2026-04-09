# MemberJunction Universal Search — Phase 2 Plan

## What Was Shipped (Phase 1)

Phase 1 delivered the full search infrastructure and UX:
- `@memberjunction/search-engine` with Entity, Vector, FTS providers + RRF fusion + permission filtering
- Shell search bar with autocomplete, Ctrl+K, keyboard navigation
- Search results page with filters, sort, refresh, search-within-results, highlight
- `NavigationService.OpenSearch()` with proper URL routing and back/forward
- `InstanceConfigEngine` for feature toggles
- `GraphQLSearchClient` and `Search` Action for agents/MCP/A2A
- Template engine `SuppressWarnings`, vectorization error bubbling
- RunView cache fingerprint fix (`UserSearchString`)
- KH vectors tab edit dialog + zero-index warning
- Classify content source validation

## Phase 2 Priorities

### Priority 1: CodeGen FTS Intelligence

**Goal:** CodeGen auto-configures Full-Text Search for all entities using LLM smarts.

The schema fields already exist (`AutoUpdateFullTextSearch` on Entity and EntityField, `AutoUpdateAllowUserSearchAPI` on Entity, `UserSearchPredicateAPI` and `AutoUpdateUserSearchPredicate` on EntityField). CodeGen needs to use them.

**Tasks:**
1. Add FTS auto-configuration to `AdvancedGeneration` in CodeGenLib
   - LLM prompt analyzes entity name, description, field types/lengths
   - Decides: should this entity have FTS enabled?
   - Decides: which text fields should be FTS-indexed?
   - Sets `Entity.FullTextSearchEnabled`, generates catalog/index/function SQL
   - Respects `AutoUpdateFullTextSearch` override bits (when false, skip)

2. Add search predicate auto-configuration
   - LLM decides per-field: `BeginsWith`, `Contains`, `EndsWith`, `Exact`
   - Name fields → `BeginsWith` (fast, index-friendly)
   - Description/Notes → `Contains`
   - Code/ID fields → `Exact`
   - Respects `AutoUpdateUserSearchPredicate` override bit

3. Add `AllowUserSearchAPI` auto-configuration
   - LLM decides: is this entity meaningful for user search?
   - System/junction/audit tables → false
   - User-facing entities with text → true
   - Respects `AutoUpdateAllowUserSearchAPI` override bit

4. Generate FTS SQL objects
   - SQL Server: `CREATE FULLTEXT CATALOG`, `CREATE FULLTEXT INDEX` with `CHANGE_TRACKING AUTO`
   - PostgreSQL: GIN index on `tsvector` column

5. Run CodeGen on test database, validate LLM decisions, tune prompts

### Priority 2: Unit Tests

**Packages needing tests:**

| Package | Tests Needed |
|---------|-------------|
| `@memberjunction/search-engine` | SearchFusion RRF correctness, Deduplicate merge/preference, EntitySearchProvider scoring, VectorSearchProvider CompositeKey parsing, SearchEngine Config/Search/PreviewSearch orchestration |
| `GraphQLSearchClient` | GQL mutation construction, parameter serialization, response mapping, error handling |
| `InstanceConfigEngine` | GetBoolean/GetNumber/GetJSON with defaults, Set persistence, DefaultValue fallback |
| Permission filtering | Entity read check, RLS re-validation via RunView, fail-closed on error |
| `ng-search` components | SearchInputComponent debounce/events, SearchSuggestComponent keyboard nav, SearchCompositeComponent preview flow + mousedown events |

**Approach:** Use Vitest (MJ standard). Mock RunView, Metadata, vector DB responses. No database connections in unit tests.

### Priority 3: Storage Search Integration

**Goal:** Search files in MJ Storage accounts that have `IncludeInGlobalSearch = true`.

**Tasks:**
1. Implement `StorageSearchProvider` in search-engine package
   - Query `FileStorageAccount` records where `IncludeInGlobalSearch = true`
   - Check provider's `SupportsSearch` flag
   - Call `FileStorageBase.SearchFiles()` across matching accounts
   - Check `FileStorageAccountPermission` for user access
   - Wrap results into `SearchResultItem` format

2. Register StorageSearchProvider in SearchEngine.Config()

3. Add storage source type to ng-search labels/icons:
   - Label: "File Storage"
   - Icon: `fa-solid fa-folder-open`

4. Test with a configured storage account (GDrive, SharePoint, Dropbox, or Box)

### Priority 4: Refactor ng-search SearchService

**Goal:** SearchService uses `GraphQLSearchClient` instead of inline GQL strings.

**Tasks:**
1. Import `GraphQLSearchClient` from `@memberjunction/graphql-dataprovider`
2. Replace `executeGraphQLSearch()` method body to use `client.ExecuteSearch()`
3. Replace `PreviewSearch()` to use `client.PreviewSearch()`
4. Remove inline GQL mutation strings
5. Update tests

### Priority 5: Performance & Polish

1. **Embedding cache** — LRU cache for recent query embeddings in VectorSearchProvider (avoid re-embedding "cheese" every time)
2. **Early termination** — If preview mode and entity search returns 8+ results with high scores, skip vector/FTS
3. **View modes** — Cards and Grid view in SearchResultsComponent (currently only List)
4. **Component documentation** — TSDoc for all ng-search public APIs
5. **KH search consolidation** — Evaluate whether KH search dashboard adds value beyond universal search, or should be removed
6. **Cross-platform testing** — Verify Entity/FTS providers work on PostgreSQL
7. **Vector score display** — Consider showing raw cosine with a tooltip explaining what it means vs normalizing

### Priority 6: Future Ideas (Not for Phase 2)

- Search Action given to Sage agent as a tool (RAG)
- SoundEx/phonetic search predicate
- Streaming results via GraphQL subscriptions
- Search analytics dashboard (popular queries, click-through rates)
- Saved searches with notifications on new matches
- Search suggestions based on entity schema (field-aware typeahead)

---

## Execution Order

1. CodeGen FTS intelligence (enables much better DB-only search)
2. Unit tests (ensures stability before more changes)
3. Storage search (new search source)
4. SearchService refactor (cleanup)
5. Performance & polish (iterative)

Estimate: 1-2 sessions for priorities 1-3, 1 session for 4-5.
