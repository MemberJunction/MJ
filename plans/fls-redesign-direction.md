# FLS Redesign — direction from leadership (2026-08-08)

> Captured from Jordan after discussion with his boss. This SUPERSEDES parts of the shipped
> Workstreams A–D; the collision list below says exactly which parts. Pattern is the same as
> the Phase 2.6 redesign: direction → collisions → research agenda → decisions → forward-only
> plan. Nothing here is implemented yet. `plans/field-level-security-implementation.md` and
> `plans/field-level-security.md` describe the as-built system this collides with.

## The direction, as given

1. **`Entity.EnableFieldLevelSecurity`** — new flag on `__mj.Entity`. FLS on an entity is ON
   or OFF explicitly; no more inferring from "does any rule exist."

2. **Trinary permissions on `EntityFieldPermission`**, separately for **Read, Update, and
   Create**: each is `Allow` / `Deny` / `No Access`, behaving like SQL Server:
   - `No Access` = neutral. Grants nothing, blocks nothing. Another role's Allow wins.
   - `Allow` = grants the action for that role.
   - `Deny` = trumps everything ("multiply by zero"). Any Deny across the user's roles wins.
   - **Convention: Read is required for Update.** `Read=No Access` + `Update=Allow` must be
     impossible (validation + constraint). **DECIDED (Jordan, 2026-08-08): Create requires
   Read the same way** — `Read=No Access` (or Deny) + `Create=Allow` is also invalid.
   This replaces the current `Type` (Allow/Deny) + `CanRead/CanUpdate/CanCreate` bit columns.
   The existing migration (`V202608051141__v6.1.x__Entity_Field_Permissions.sql`) is edited
   IN PLACE (nothing is pushed) and gains the `__mj.Entity` DDL.

3. **Snapshot initialization.** Flipping the flag ON creates EFP rows for every (entity
   field × role that has read/create/update entity permission), mirroring entity-level
   permissions: entity read → `Read=Allow`; no entity update → `Update=No Access`; etc.
   Defaults change NOTHING behaviorally — admins then tighten per field. Flipping OFF:
   **DECIDED (Jordan, 2026-08-08): KEEP the rows, functionally inactive** — enforcement gates on the flag; re-enabling runs the same
   reconciliation CodeGen needs anyway (add missing rows with defaults, remove orphans);
   admin UI gets an explicit "reset to defaults" action for intentional wipes; UI copy says
   rules are preserved-but-inactive. Disabling must also drive CodeGen's permission
   reconciliation so DB-tier DENYs are revoked.

4. **Lifecycle management is CodeGen-aware and centralized.** New field on an FLS-enabled
   entity → CodeGen creates its EFP rows per the init rules. Column removed / entity deleted
   → CodeGen cleans up. Enable→disable→schema change→re-enable → graceful reconciliation.
   All mutations transactional (flag flip + initialization atomically).
   **Location (DECIDED, Jordan 2026-08-08):** a pure delta-computation module in MJCoreEntitiesServer
   (beside the existing FLS guards) + three thin transactional adapters:
   `MJEntityEntityServer` (runtime flag flip), a manage-metadata CodeGen step (schema
   changes), and `MJEntityPermissionEntityServer` (entity-permission changes on FLS-enabled
   entities — a role granted entity read AFTER enablement has no EFP rows and would
   otherwise see zero fields).

5. **Restricted Get/Set throws.** `BaseEntity.Get`/`Set` (the strongly-typed accessor path)
   raises a runtime error when the context user is denied the field. Wording follows the
   ambiguous-error rule. (Framework-internal raw reads — save SQL, serialization — do not go
   through Get/Set and keep working.)

6. **Permission mutations invalidate browser metadata caches.** Any permission change (FLS
   or otherwise) → server pushes a metadata-dataset invalidation over pub/sub to all active
   subscriptions → clients re-fetch (≤10s tolerated). Login with stale IndexedDB must pick
   up fresh permissions. Admin UI batches all permission edits into ONE transaction/batch so
   other clients see ONE invalidation. Server-side metadata stays current without a full
   refetch.

7. **RunView caching, final posture:** SERVER cache returns to full-width slots serving all
   users; per-request result = intersection(allowed fields, requested fields) projected at
   read time; **the server-side `fls:` hash in the cache key is removed**. CLIENT keeps
   receiving only allowed width (restricted columns never leave the API) and KEEPS the
   allowed-list hash in its cache key.

## Collision list (against the as-built A–D + post-D batch)

| # | Collision | Disposition |
|---|---|---|
| 1 | **Allow-list flip** (first rule closes the field for everyone) — the basis of guide §1.1, the changeset story, and the system-user exemption's primary rationale | Replaced by the enable flag + snapshot init. Rewrite guide/changeset/comments. Exemption: RECOMMEND KEEP as backstop (task-mode first-caller, forceRefresh) — decision needed. |
| 2 | **Write-only case** (read-denied + update-allowed) — live-verified in D-2; A2 strip was narrowed to permit it | FORBIDDEN by the Read-required-for-Update convention. Revert the strip to all-denied-read; rewrite the write-only tests as forbidden-config tests. The blind-set-dirty setter change is harmless, keep. |
| 3 | **Server cache** — C1 `fls:` segment (server), C2 allowed-set widening, server entity_object cache exemption | REMOVED/reverted to full-width widening + read-time projection (the original Phase-2 posture; third reversal of the ApplyFieldSecurityProjection doc comment — record the history in it). KEEP: client allowed-list key, client wire narrowing, smart-cache path gate+projection, predicate gates, `Load()` allowed-column SELECT — **DECIDED (Jordan, 2026-08-08): stays** (per-request, never cached; protects restricted service accounts). |
| 4 | **Schema**: `Type`+bits → three trinary enum columns; `Entity` gains the flag | Edit migration in place; regen MJCoreEntities via CodeGen; rewrite `EntityFieldPermissionInfo`, the aggregation (`GetUserFieldPermissions`), and every FLS test fixture. |
| 5 | **Enforcement gate** `HasAnyFieldPermissions` (~10 sites) | Becomes `Entity.EnableFieldLevelSecurity` (keep the memoized per-entity boolean pattern). |
| 6 | **Create enforcement** — deliberately unenforced today | Now in scope. Read-requires-Create half is DECIDED (see direction §2). Remaining design question: what does non-Allow Create mean at insert — reject an explicitly supplied value, or silently apply the column default? |
| 7 | **CodeGen** — B emits DENYs from `Type='Deny'` rows | Predicate becomes trinary `Read=Deny` + flag-gated; reconciliation unchanged; NEW: EFP record lifecycle in manage-metadata. |
| 8 | **Get/Set throwing** | Prerequisite MET (2026-08-08): the BaseEngine system-user-loads change is COMPLETE — `BaseEngine.ResolveContextUser()` forces the system user on Database providers via the `WellKnownUserSource` seam (`SystemUserID` now lives in GenericDatabaseProvider, not MJCore); engines never load restricted. Design: `plans/baseengine-system-user-loading.md`. Get/Set throwing is unblocked. Stale warn-don't-support comments in the two config guards and `flsCacheExemptEntityObjectRequest` get corrected during the trinary rework. |
| 9 | **Metadata invalidation** | New infra. Verify EFP/EntityPermission participate in MJ_Metadata dataset staleness; wire pub/sub dataset invalidation; batch-save = one invalidation; server metadata incremental update. |
| 10 | **Initialization details** | Skip unrestrictable fields (PKs, `__mj_`)? Roles without entity permissions get no rows (entity gate already excludes them). System-user guard (`MJUserRoleEntityServer`) semantics under trinary. |

## Research agenda for the fresh session (before any code)

R1. Trinary schema design: enum storage (nvarchar+CHECK vs tinyint), the Read≥Update(≥Create?)
    constraint shape, migration edit, MJCoreEntities regen impact, EFP subclass validation.
R2. Aggregation rewrite: exact truth table for {Allow,Deny,NoAccess}³ across multiple roles,
    with the system-user exemption question resolved; performance shape preserved (per-entity
    flag gate; per-request denied-set precompute — "denied" now means "not allowed OR denied").
R3. Lifecycle module: API of the pure delta function; transaction mechanics in each adapter
    (BaseEntity TransactionGroup vs raw SQL batch — note bulk inserts of fields×roles rows;
    Record Changes noise; save-time guards must still apply or be consciously bypassed).
R4. Create enforcement semantics end-to-end (BaseEntity insert, GraphQL create input,
    spCreate defaults, D-1's "creates are safe" note superseded).
R5. Get/Set throw: exact throw sites, ambiguous wording, exemptions (system user; raw
    framework reads), client UI blast radius (defer UI, but inventory).
R6. Cache reversal: remove server fls: segment + allowed-set widening + server entity_object
    exemption; verify projection covers both cache paths (it always did); keep client pieces;
    decide `Load()` narrowing fate; update slot-maintenance matrix tests.
R7. Metadata pub/sub invalidation: existing CACHE_INVALIDATION_TOPIC / remote-invalidate
    infra; dataset staleness on login; one-invalidation batching; ≤10s propagation.
R8. What survives of the UNCOMMITTED post-D batch (see JUMPSTART-FLS-REDESIGN.md for the
    list): client allowed-key = keep; guards = rework for trinary; exemption = decision;
    Load() narrowing = decision; changeset/guide = rewrite.

## Status of prior decisions

- Ambiguous denial wording: UNCHANGED, applies to all new rejection/throw paths.
- Unrestrictable targets (PKs, `__mj_`, security/identity entities): UNCHANGED.
- No PERSON exempt: UNCHANGED. System-user exemption: PENDING re-confirmation under the new
  model (recommend keep).
- PG emits nothing at DB tier; SQL Server DENYs custom-roles-only with service-login
  backstop: UNCHANGED in principle; predicate updates per collision 7.
- Deferred RunView reroute (BypassCache, relationships untouched): UNCHANGED.
- One PR for everything: UNCHANGED (Jordan).
