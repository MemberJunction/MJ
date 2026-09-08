# CodeGen Search Tightening — Implementation Plan

## Goal

Make CodeGen's "Smart Field Identification" stingy by default. Today the LLM liberally enables `AllowUserSearchAPI` (entity-level), `IncludeInUserSearchAPI` (field-level), and chooses `Contains` predicates too freely — for entities that should never participate in user search and for fields like `OrderLines.Comments` that drive unindexed scans.

We want:
- **Search OFF by default**, both entity-level and field-level.
- **Each enable requires an explicit, high-confidence justification** from the LLM.
- **Predicate defaults**: `Exact` for unique identifiers, `BeginsWith` for everything else. `Contains` is reserved for FTX-enabled entities and must be explicitly justified.
- **__mj schema hygiene** moves into `metadata/entities/` and `metadata/entity-fields/` so it's source-of-truth and survives metadata re-pushes.

## Background

Source: `/home/user/MJ` repo, branch `claude/review-search-logic-j0C3f`.

### How search flags get set today

1. **Trigger**: For every entity on every CodeGen run, `processEntityAdvancedGeneration()` ([packages/CodeGenLib/src/Database/manage-metadata.ts:4754](../packages/CodeGenLib/src/Database/manage-metadata.ts#L4754)) calls `ag.identifyFields()` whenever any field on the entity has any `AutoUpdate*` flag still set to 1, or the entity itself has `AutoUpdateAllowUserSearchAPI`/`AutoUpdateFullTextSearch` set ([line 4771](../packages/CodeGenLib/src/Database/manage-metadata.ts#L4771)).

2. **Decision**: One LLM call per entity executes the `CodeGen: Smart Field Identification` prompt ([packages/CodeGenLib/src/Misc/advanced_generation.ts:182](../packages/CodeGenLib/src/Misc/advanced_generation.ts#L182), template at [metadata/prompts/templates/codegen/smart-field-identification.template.md](../metadata/prompts/templates/codegen/smart-field-identification.template.md)). The LLM returns `allowUserSearch`, `searchableFields[]`, `searchPredicates[]`, optional FTS settings — for the whole entity in a single shot.

3. **Application**: `applySmartFieldIdentification()` ([line 4900](../packages/CodeGenLib/src/Database/manage-metadata.ts#L4900)) fans the result out into UPDATEs, gated by `AutoUpdate*` flags. Existing guardrails:
   - `isFieldEligibleForUserSearch()` blocks PKs, non-text types, unbounded text on non-FTX entities (always-wrong cases).
   - `isLikelyLogOrAuditEntity()` blocks entity-level promotion on names matching `*Logs`/`*Runs`/`Audit*`/`Record Changes`.

4. **Persistence**: Settings stick only when `AutoUpdate*` flags are flipped to 0 — otherwise next CodeGen re-decides. The existing `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` did a one-shot SQL sweep to disable + freeze __mj entities, but it's not source-of-truth — re-pushing metadata could undo it.

### Why the LLM is liberal

The prompt's "Good candidates" list ([template:118-124](../metadata/prompts/templates/codegen/smart-field-identification.template.md#L118)) recommends:
- Name/title fields ✓
- Email, phone ✓
- Unique codes ✓
- Company/organization names ✓ (often too many)
- **Short text fields (MaxLength < 200) — City, state, job title, etc.** ✗ (these are filter targets, not search targets)

The Member example ([template:243-271](../metadata/prompts/templates/codegen/smart-field-identification.template.md#L243)) reinforces this with 7 searchable fields. There's no concept of *"most entities need 0–2 searchable fields"* and no notion of entity role (primary / supporting / junction / detail / system).

### Existing metadata/entities pattern

`metadata/entities/.mj-sync.json` targets `MJ: Entities`. Files use `@lookup:MJ: Entities.Name=...` as primary key with surgical `fields` overrides. Existing `.audit-related-entities.json` covers the same audit/log entity list as the v5.33 hygiene migration but only sets `TrackRecordChanges`/`TrustServerCacheCompletely` — it does **not** set the search flags, so search hygiene currently lives only in the migration.

There's no `metadata/entity-fields/` folder yet — we'll add one for field-level freezes.

## Implementation Phases

Three commits on `claude/review-search-logic-j0C3f`. Each is independently testable but they ship as one PR.

### Phase 1 — Tighten the LLM prompt

Edit `metadata/prompts/templates/codegen/smart-field-identification.template.md`.

**Changes:**

1. **Reframe the entity-level decision (`allowUserSearch`) as opt-in with high confidence.** Add a section near the top:
   > Default to `false`. Only set `true` if the entity is a primary user-facing record (Customers, Products, Members, Documents, Companies) that users would naturally find by typing in a search box. **If you are not highly confident, return `false`.**
   
   Rewrite the existing "Set to false for" list to be longer and more explicit (system tables, lookup/reference tables, junction tables, detail/line-item tables, audit/log tables, ANY entity whose name ends in `Detail`/`Line`/`Item`/`Step`/`Param`/`Mapping`/`Run`/`Log`/`Audit`).

2. **Tighten "Good candidates" for `searchableFields`.** Replace the current bullet list with a narrow whitelist:
   - Name fields (Name, Title, FirstName, LastName, DisplayName)
   - Unique business identifiers (OrderNumber, SKU, AccountNumber, MemberID, InvoiceNumber)
   - Email addresses
   - Phone numbers (only if they are the primary lookup key for the entity)
   
   And explicitly **remove** city / state / job title / company name from "good candidates" — those should be filter targets, not search targets.

3. **Add an explicit "Never searchable" anti-pattern list:**
   - Narrative fields: `Comments`, `Notes`, `Description`, `Bio`, `Body`, `Memo`, `Summary`, `Content`, `Remarks`, `Details`
   - These are only legitimate when the entity has `enableFullTextSearch: true` AND the field is in `fullTextSearchFields[]`.

4. **Add per-entity cap guidance**: "Most entities need 0–2 searchable fields. More than 3 is exceptional and must be justified."

5. **Tighten predicate guidance:**
   - Default `Exact` for: Email, SKU, OrderNumber, AccountNumber, ZipCode, Phone, SSN, ISBN, any identifier-shaped field.
   - Default `BeginsWith` for: Name, Title, FirstName, LastName, Code.
   - **`Contains` is reserved for fields included in `fullTextSearchFields[]`.** Do not use `Contains` on a non-FTX field — it forces unindexed scans. If you find yourself wanting `Contains` for a narrative field, set `enableFullTextSearch: true` and put the field in `fullTextSearchFields[]` instead.
   - `EndsWith` is rare — only for domain-suffix or extension-suffix lookups.

6. **Add new response field `allowUserSearchReason` requirement**: when `allowUserSearch=true`, the reason MUST cite a concrete user behavior ("users type customer names into the search box"), not a generic justification ("this is a record"). Same for `searchableFieldsReason` — must cite specific fields and why they're search-worthy not filter-worthy.

7. **Update worked examples** to reflect the tighter rules:
   - Members example: drop `Title`, `City`, `OrganizationName` from `searchableFields`. Keep `FirstName`, `LastName`, `Email`, `Phone`. Predicate for names = `BeginsWith`, Email/Phone = `Exact`.
   - Add a new example for a **detail/junction entity** (e.g. `OrderLines`) that returns `allowUserSearch: false`, `searchableFields: []` even though it has nvarchar columns like `Comments`.
   - Add a new example for a **reference/lookup entity** (`Countries`) that returns `allowUserSearch: false` because users filter by country, they don't search for it.

**Push step:** `npx mj sync push --dir=metadata --include="prompts"` after editing the template (the database stores the resolved content, not the @file: reference).

### Phase 2 — Code-level guardrails in CodeGenLib

Edit `packages/CodeGenLib/src/Database/manage-metadata.ts` and `packages/CodeGenLib/src/Misc/advanced_generation.ts`.

**Changes:**

1. **Field-name blocklist guardrail.** New helper in `manage-metadata.ts`:
   ```typescript
   protected isNarrativeFieldName(fieldName: string): boolean {
       return /^(Comments?|Notes?|Description|Bio|Body|Memo|Summary|Content|Remarks?|Details)$/i.test(fieldName)
           || /(Comment|Note|Description|Bio|Body|Memo|Summary|Content|Remark)$/i.test(fieldName);
   }
   ```
   Apply in `applySearchableFieldUpdates()`: if field name matches AND parent entity is not FTX-enabled, reject regardless of LLM output.

2. **Per-entity cap.** In `applySearchableFieldUpdates()`, after filtering through existing guardrails, slice to at most 3 fields. Prefer fields with `BeginsWith`/`Exact` predicates and name-like field names (Name/Title/FirstName/LastName/Email) over ambiguous matches.

3. **Predicate normalization.** In `applySearchPredicateUpdates()`:
   - If LLM returns `Contains` and the field is not in `fullTextSearchFields[]` (or entity is not FTX-enabled), **rewrite to `BeginsWith`**. Log a warning.
   - If LLM returns nothing for a searchable field, default to `Exact` for identifier-shaped names (regex `/^(Email|SKU|.*Number|.*Code|.*ID|ZipCode|Phone|SSN|ISBN)$/i`), else `BeginsWith`.

4. **Default-off semantics for entity-level enable.** In `applyEntitySearchConfig()`, refuse to flip `AllowUserSearchAPI` from 0→1 unless ALL of:
   - `result.confidence === 'high'`
   - `result.searchableFields.length > 0` after all guardrails
   - entity is not in `isLikelyLogOrAuditEntity()`
   - entity name doesn't match `/(\sDetail|\sLine|\sItem|\sStep|\sParam|\sMapping)s?$/i`
   
   Any 0→1 flip that survives all checks should log the entity name + the LLM's `allowUserSearchReason` to the CodeGen report — so we can grep proposals after each run.

5. **`AdvancedGeneration.identifyFields()` response cleanup.** After receiving the LLM result, normalize: if `allowUserSearch === false` then force `searchableFields = []` and `searchPredicates = []` (the LLM sometimes returns inconsistent shapes). Likewise if `searchableFields` is empty, force `allowUserSearch = false`.

6. **Telemetry.** Existing `CodeGenReporter` already records LLM calls. Extend to also record per-entity counts of: searchable fields proposed, searchable fields accepted (after guardrails), entity-level enable proposed/accepted, predicate normalizations applied. Surface in the end-of-run summary so the user can see the impact of the tightening.

7. **Unit tests.** Add `packages/CodeGenLib/src/__tests__/manage-metadata-search-guardrails.test.ts` covering:
   - Narrative-field name blocked on non-FTX entity.
   - Narrative-field allowed on FTX entity in `fullTextSearchFields[]`.
   - Per-entity cap of 3.
   - `Contains` → `BeginsWith` normalization on non-FTX field.
   - `Exact` defaulting for `Email` / `*Number` / `*Code`.
   - Entity-level 0→1 refused on confidence='medium'.
   - Entity-level 0→1 refused on detail/line-item entity name pattern.
   - Empty searchableFields → forced `allowUserSearch=false`.
   
   Vitest, mocking the LLM call.

**Build & test.** `cd packages/CodeGenLib && npm run build && npm run test`.

### Phase 3 — __mj entity-level search hygiene as metadata source-of-truth

Move the **entity-level** portion of the v5.33 migration into `metadata/entities/`. Once committed, `mj sync push` becomes the single mechanism for keeping the __mj `AllowUserSearchAPI` settings frozen.

**Scope** — only section 1 of the v5.33 migration (entity-level disable on __mj log/audit/run/snapshot entities). Sections 2–4 of that migration (PK disable system-wide, non-text disable system-wide, MAX-without-FTX disable system-wide) cover thousands of fields across all schemas and are framework-level invariants — they belong as **code-level guardrails in Phase 2**, not as enumerated metadata. The shipped v5.33 migration handles the historical one-shot cleanup; Phase 2 keeps it clean going forward.

**Pattern** — use the existing `.credentials-encryption-fields.json` shape, not a new `entity-fields/` folder. Field-level overrides (when we need any) nest inside the entity record under `relatedEntities["MJ: Entity Fields"]`:

```json
{
  "fields": {
    "Name": "MJ: Audit Logs",
    "AllowUserSearchAPI": false,
    "AutoUpdateAllowUserSearchAPI": false
  },
  "relatedEntities": {
    "MJ: Entity Fields": [
      {
        "fields": {
          "EntityID": "@parent:ID",
          "Name": "Description",
          "IncludeInUserSearchAPI": false,
          "AutoUpdateIncludeInUserSearchAPI": false
        }
      }
    ]
  }
}
```

This keeps everything about an entity in one record — much cleaner than a parallel folder, and matches the established pattern.

**Changes:**

1. **Augment `metadata/entities/.audit-related-entities.json`.** For every entity already in that file that is also in the v5.33 migration's disable list, add to the `fields` block:
   ```json
   "AllowUserSearchAPI": false,
   "AutoUpdateAllowUserSearchAPI": false
   ```
   Some entries in that file (e.g. `MJ: Conversations`, `MJ: Conversation Details`, `MJ: Queue Tasks`, `MJ: Conversation Detail Artifacts/Attachments/Ratings`) are not in the migration's search-disable list — leave their search flags untouched.

2. **Add missing entities** from the v5.33 disable list that aren't yet in the file:
   - `MJ: Tag Audit Logs`
   - `MJ: MCP Tool Execution Logs`
   - `MJ: Content Process Run Details`
   - `MJ: Content Process Run Prompt Runs`
   - `MJ: Test Run Outputs`
   - `MJ: Report Snapshots`
   - `MJ: Archive Runs`
   - `MJ: Archive Run Details`
   
   Each new entry gets `TrackRecordChanges=false`, `TrustServerCacheCompletely=false`, `AllowUserSearchAPI=false`, `AutoUpdateAllowUserSearchAPI=false`.

3. **Push step:** `npx mj sync push --dir=metadata --include="entities" --dry-run` to verify, then without `--dry-run` to apply.

4. **Migration disposition:** keep the existing v5.33 migration in place (it's already shipped; ripping it out breaks installations mid-upgrade). The migration handles historical bootstrap; the metadata file becomes the source-of-truth for future state. No header-comment rewrite needed — git history shows the relationship.

5. **Field-level narrative-field hygiene is deferred to Phase 2.** Rather than enumerate every `Description`/`Comments`/`Notes` column on every __mj entity in metadata, the code-level guardrail in Phase 2 will enforce the rule programmatically (regex-blocked at apply time, regardless of LLM output). That's both more robust and less metadata churn. Any specific exceptions can be added later via `relatedEntities["MJ: Entity Fields"]` per the pattern above.

### Phase 4 — Verification

Before opening the PR for the actual code changes (this PR is plan-only):

1. **Dry-run CodeGen** against a representative dev database with the new prompt + guardrails, capture proposed changes in CodeGenReporter output, compare to current behavior.
2. **Spot-check** a handful of consumer-app entities to confirm we're not over-tightening:
   - A genuine "primary" entity (e.g., `Member` / `Customer`) — should keep ~2-3 searchable fields, predicates `BeginsWith`/`Exact`.
   - A detail entity (e.g., `OrderLine`) — should drop to 0 searchable fields and `AllowUserSearchAPI=false`.
   - A junction (e.g., `UserRole`) — should be 0/false.
   - A lookup (e.g., `Country`) — should be 0/false.
3. **Run unit tests**: `cd packages/CodeGenLib && npm run test`.
4. **Push __mj metadata** in a staging environment and confirm no regressions.
5. **Release-notes entry** for v5.x explaining the tightening, the metadata-source-of-truth move, and how consumers can opt back in (set `AutoUpdate*=0` and manually flip `AllowUserSearchAPI`/`IncludeInUserSearchAPI` to 1, or set them in their own metadata).

## Risks & mitigations

- **Fleet-wide blast radius.** Every consuming repo that runs CodeGen will see proposals change on the next run. Anything with `AutoUpdate*=1` is fair game. Mitigation: dry-run + release notes call out the change. Anyone who liked the old behavior can freeze it with `AutoUpdate*=0` before upgrading.
- **Over-tightening genuine cases.** "City" search on a Members table might be legitimate for some products. Mitigation: caps and blocklists are heuristics, not hard limits — operators can override by setting `AutoUpdateIncludeInUserSearchAPI=0` and flipping the flag manually, or by adding their own metadata file.
- **__mj field-level metadata regeneration churn.** Auto-generating `metadata/entity-fields/` files from a DB query produces a large JSON. Risk of merge churn. Mitigation: keep one file per concern (narrative fields, PK fields), sort entries deterministically by `Entity` then `Name` so diffs are stable.
- **Loss of `Contains` for legitimate cases.** Some entities might genuinely want `Contains` without FTX (e.g., a small, low-cardinality reference table where scan cost is negligible). Mitigation: the rewrite to `BeginsWith` is in code, not in metadata — if the team wants `Contains` they can set `AutoUpdateUserSearchPredicate=0` and put `Contains` in directly. Document this in the release notes.

## Out of scope (for this PR)

- Refactoring smart-field-identification to run *after* form-layout-classification so it can use `entityCategory`. Useful but bigger; revisit after this lands.
- Removing the v5.33 hygiene migration. Stays put — it's already shipped to installs.
- Auto-suggesting `enableFullTextSearch` for entities that have narrative fields. Separate concern; FTS infra needs its own pass.

## Files touched

- `metadata/prompts/templates/codegen/smart-field-identification.template.md` — Phase 1
- `packages/CodeGenLib/src/Database/manage-metadata.ts` — Phase 2 (guardrails)
- `packages/CodeGenLib/src/Misc/advanced_generation.ts` — Phase 2 (response normalization)
- `packages/CodeGenLib/src/__tests__/manage-metadata-search-guardrails.test.ts` — Phase 2 (new)
- `metadata/entities/.audit-related-entities.json` — Phase 3 (augment + missing entries)
- Release notes / changelog — Phase 4

**Not touched** — no new `metadata/entity-fields/` folder, no new SQL migration. Field-level enforcement and PK/non-text/MAX-without-FTX hygiene live in Phase 2 code guardrails. Existing v5.33 migration stays as-is.

## Acceptance criteria

- [ ] Prompt template returns `allowUserSearch: false` for log/audit/junction/detail/lookup entities in spot-check runs.
- [ ] Prompt template returns ≤ 3 searchable fields for primary entities; never includes `Comments`/`Notes`/`Description` unless FTX-enabled.
- [ ] Code guardrail: `Contains` predicate is rewritten to `BeginsWith` on non-FTX fields, with a logged warning.
- [ ] Code guardrail: narrative-field-name regex blocks search regardless of LLM output (unless FTX-enabled).
- [ ] Unit tests cover all guardrail branches and pass.
- [ ] `metadata/entities/.audit-related-entities.json` carries `AllowUserSearchAPI=false` + `AutoUpdateAllowUserSearchAPI=false` for every audit/log/run entity from the v5.33 migration list, and includes entries for the eight entities in the migration list that were missing from the file.
- [ ] CodeGenReporter end-of-run summary shows search-flag proposal counts.
