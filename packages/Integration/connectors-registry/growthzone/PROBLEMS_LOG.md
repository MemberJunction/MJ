# GrowthZone connector — complete problem log (2026-06-11)

Every problem encountered building/fixing the GrowthZone connector to a clean, fully-working state,
with root cause + fix + WHERE it belongs (connector vs metadata vs framework). Kept growing live.

Legend: **[C]** connector code · **[M]** metadata/extraction · **[FW]** framework/engine/schema · **[OPS]** pipeline/operational

---

## A. CONNECTOR CODE BUGS  [C]

1. **Pagination param prefix — `$skip`/`$top` not `skip`/`top`.** GrowthZone is OData and honors only
   the `$`-prefixed params; the connector used un-prefixed `skip`/`top`, which the server **silently
   ignores** → every "next page" returned the same first 100 rows → the base loop's duplicate-page
   detector (correctly) stopped → **every object capped at one page (~100)**. Proven live: `?skip=3`
   returns same IDs as `?skip=0`; `?$skip=3` advances. Fix: `ODATA_SKIP_PARAM='$skip'`, `ODATA_TOP_PARAM='$top'`.

2. **`ExtractPaginationInfo` wrong end-of-stream test.** Used `results.length < requestedPageSize` as the
   terminator — breaks when the server caps the page BELOW the requested size (GrowthZone caps at 100 even
   when you ask for 200). Fix: trust `TotalRecordAvailable` (offset+count vs total); when absent, stop only
   on an EMPTY page, never on a short page. Also clamp requested page size to the server cap (100).

3. **Page-size clamp** — requesting `top>100` on some endpoints returns `400 The request is invalid`.
   Clamp to `GROWTHZONE_MAX_PAGE_SIZE=100`.

---

## B. WRONG API PATHS (extraction guessed, never verified live)  [M]

The original extraction wrote API paths from docs WITHOUT verifying against the live API (build is
credential-free). MANY were wrong — only discoverable by a live read-only probe:

| Object | Wrong (shipped) | Correct (live-verified) |
|---|---|---|
| Group | `/api/groups/ByCategory` (400, needs param) | `/api/groups/all` |
| GroupCategory | `/api/groups/ByCategory` | `/api/groups/categories` |
| Event | `/api/events` (404) | `/api/events/all` |
| **ContactPhone** | `/api/contacts/{id}/notesandfields` (**same path as ContactCustomField!**) | `/api/contacts/phones/{id}` |
| ScheduledBillingUpdate | `/api/scheduledbilling/membershiptype` (404) | `/api/memberships/scheduledbilling?membershipId=` |
| MembershipChange | `/api/memberships/change/{id}/{type}` (400) | `/api/memberships/change?membershipId=` |
| MembershipStatusLookup | `/api/memberships/lookup/status/{x}` | `/api/memberships/lookup/status/Active` (enum-list door) |
| Event children (10) | path-style `/api/events/{eventId}/sponsors` (some 404) | query-style `/api/events/sponsors?eventId=` |
| Membership (door) | — | `/api/memberships/all` (the `/all` pattern) |

- **`/all` door pattern**: list endpoints are `/api/<resource>/all`, not `/api/<resource>` — undiscoverable from docs.
- **Event children are query-param** (`?eventId=`) not path-segment — and inconsistently (attendees 404s path-style).
- **Store×3, Directory×2, Certification×2 = tenant-disabled modules** (every path variant 404s). The connector
  shipped them as if available; they're legitimately N/A for this tenant.

**Root cause (agent-arch):** discovery/paths were baked from docs at build time with no live verification.
The credential-free build can't catch wrong paths. Needs a live path-verification gate when creds exist.

---

## C. METADATA QUALITY  [M]

4. **FK form: `@lookup` on `RelatedIntegrationObjectID`.** Should be soft-FK by NAME
   (`Configuration.ReferencedType`, `RelatedIntegrationObjectID=null`), not `@lookup` (push-time rollback risk)
   nor hardcoded UUID (rule violation). Parent-fetch uses `Configuration.parentObjectName`, so nulling the FK
   pointer is safe. (My first attempt resolved `@lookup`→UUID — wrong, corrected by the user.)

5. **PK declared on null-valued fields (13 objects).** EventSponsorId, ContactPhoneId, CustomFieldId,
   MembershipTypeId (ScheduledBilling), + Event-children IDs — the source returns these `*Id` fields NULL
   (nested/derived records). Declared as PK → null-PK rows. Identity must fall back to content-hash (§4).
   (My first attempt dropped IsPrimaryKey — wrong; the PK IS the right identity when present. Real fix is FW, below.)

6. **String field sizing — all 717 IOFs `Length=null`** (26 with a stray `Length=255`). With the framework
   sizing null→255-floor, long/JSON fields (SponsorSettingsJson, SettingJson, Notes) truncate; on re-apply,
   SchemaEvolution tries to NARROW existing MAX columns → "String or binary data would be truncated".

---

## D. FRAMEWORK / ENGINE / SCHEMA BUGS (uncovered while fixing GrowthZone)  [FW]

7. **Soft-PK column emitted `NOT NULL`.** `IntegrationDiscoveryResolver.ts:1591` did `IsNullable: !f.IsPrimaryKey`
   — but integration PKs are SOFT (tracked via `SchemaBuilder.SoftPrimaryKeys` + content-hash fallback). Forcing
   the column NOT NULL rejects every null-PK row (the 13 objects) before content-hash can save it. **Fix: soft-PK
   columns are nullable** (`IsNullable: true`). The sibling path (line 1676) already used `f.AllowsNull` —
   inconsistent. (User-confirmed: "pks are soft".)

8. **TypeMapper sizes unknown-length strings too tight.** `boundedStringLength` returns the 255 floor for a
   null `MaxLength` — but per the bounded-typing policy, unknown size = size GENEROUSLY (never truncate). For a
   source like GrowthZone that reports NO field sizes (all null), 255 truncates long/JSON fields. **Fix: null →
   unbounded text (NVARCHAR(MAX)); only bound when a length is declared.** (DDL still caps PK columns to 450 for
   index-eligibility, so PKs stay keyable.)

9. **`MetadataSource` NOT NULL + stale create-sproc.** Fresh-DB `spCreateIntegrationObjectField` (from the v5.x
   baseline) doesn't default `MetadataSource` → IOF insert fails "Cannot insert NULL into MetadataSource".
   **Workaround: run `mj codegen` BEFORE the push** to regenerate the sproc. (Order: migrate → codegen → push.)

10. **SchemaEvolution false-positive narrowing on existing tables.** On the dirty DB, evolution kept generating
    ALTERs that narrowed MAX columns (mixed existing types from prior applyall runs vs new targets) → truncation.
    A fresh CREATE sidesteps it; the evolution comparison on accumulated dirty state is fragile.

11. **Stale class-registration manifests break MJAPI boot.** The MJAPI/ServerBootstrap manifests referenced
    entities not present in the loaded `GeneratedEntities` (`MJRSUAuditLogEntity`, then `growthzone*Entity` from a
    prior dirty-DB codegen) → `SyntaxError: does not provide an export` on boot. Fix: regenerate the supplemental
    manifest (`npm run mj:manifest:api`) / rebuild ServerBootstrap from clean src.

12. **(Observed, NOT fixed here — out of scope)** `MetadataSync/provider-utils.ts` uses mssql's 15s default
    `requestTimeout`; a large push (717 IOFs + RecordChange each) can exceed it → "operation timed out" mid-tx.
    Mitigated operationally (stop MJAPI to release lock contention). Belongs in a separate framework PR.

---

## E. PIPELINE / OPERATIONAL  [OPS]

13. **Stale engine dist (turbo cache) masked the pagination fix** — first `$skip` fix appeared not to work
    until a `--force` rebuild; the cached engine dist was being loaded.

14. **MJAPI restart mid-sync → zombie run.** Killing MJAPI during a sync leaves the run artifact without a
    terminal `result.json` → `IsInFlight` stuck true → `StartSync` returns the zombie instead of starting fresh.
    Fix: write a terminal `result.json`. LESSON: never restart MJAPI mid-sync.

15. **Dropped-table ApplyAll fails** — MJAPI's in-memory schema cache thought dropped tables still existed
    (→ ALTER a non-existent table); and CodeGen tried to generate views/sprocs for entities whose tables were
    dropped. The dirty DB can't be salvaged piecemeal — only a fresh DB is clean.

16. **Deprecated connector seeded by the baseline.** A fresh `mj migrate` seeds the OLD GrowthZone connector
    (integration `248E9418` + 26 lowercase IOs). The canonical `mj sync push` MUST `deleteRecord` those 26 (IOFs
    first, then IOs, `--delete-db-only`) while inserting the new 38 — proven (190 deleted, 755 created).

17. **Fresh-DB setup plumbing**: needed to (a) seed the `GrowthZone OAuth2` credential type before the integration
    push (its `CredentialTypeID @lookup`), (b) create a Company (baseline seeds none), (c) create the
    CompanyIntegration via the broker (OAuth secret never touches the agent).

18. **Rate-8 provoked 516 vendor 429s** — the per-credential AIMD absorbed them, no data loss (this is the
    rate-limit-resilience proof, not a defect; use ~3 tok/s for normal runs).

19. **Generated-tree churn**: ApplyAll/codegen rewrite `generated.ts` + manifests; MJAPI (tsx) then fails to boot
    on decorator/export errors until restored (`git checkout` the generated files) or the manifest regenerated.

---

## SUMMARY OF FIXES BY LOCATION
- **Connector** (`GrowthZoneConnector.ts`): $skip/$top, ExtractPaginationInfo, page-size clamp.
- **Metadata** (`.growthzone.integration.json`): 17 paths, soft-FK form, real PKs kept.
- **Framework**: `IntegrationDiscoveryResolver:1591` (soft-PK nullable), `TypeMapper.boundedStringLength` (null→MAX).
- **Pipeline order**: fresh DB → `mj migrate` → `mj codegen` (sprocs) → `mj sync push` (deleteRecord deprecated + seed 38) → manifest regen → restart → ApplyAll (fresh CREATE) → sync.

---

## F. DEEPER §4 GAP — generated CRUD sproc reloads by the null soft-PK  [FW]  (uncovered after the soft-PK column fix)

20. **`spCreate` reloads by the soft-PK, which is null → "no rows returned from SQL" (13 objects).**
    After the soft-PK column was made nullable (D7), the null-PK INSERTs no longer fail — BUT the
    codegen-generated `spCreateContactPhone` (etc.) does `INSERT ... SELECT * FROM vwContactPhones WHERE
    [ContactPhoneId] = @ContactPhoneId`. With `@ContactPhoneId = NULL`, `WHERE col = NULL` returns 0 rows →
    the create returns no row → `BaseEntity.Save()` reports "Error creating new record, no rows returned".
    Confirmed: `growthzone.ContactPhone` has **PK: NONE**, no identity column, only `__mj_integration_ContentHash`
    is a guaranteed-populated identity. So the ENGINE correctly uses content-hash for sync identity (§4), but the
    GENERATED CRUD sproc still keys its post-insert reload off the (null) declared soft-PK.
    **Root cause:** integration shadow tables whose source returns a null/absent PK have no usable reload key in
    the generated CRUD. **Fix direction:** codegen's integration `spCreate`/`spUpdate` must reload by
    `__mj_integration_ContentHash` (the guaranteed identity) for soft-PK rows, not the nullable declared PK.
    Affects exactly the 13 always-null-PK objects; the 18 objects with a real populated PK sync fine.

21. **Ordering: parent-iterated children processed BEFORE their parent door on the first fresh sync →
    `ZERO_PARENTS`.** On a fresh DB the Contact table starts empty; Contact-children (Person, Organization,
    ContactAddress, ContactEmail, ContactNotes, ContactCategory) whose entity-map runs before the Contact
    door finishes find 0 parent IDs (`LoadParentIDs` reads the synced table) → fetch 0 → land 0. ContactEngagement
    ran after Contact → landed (449). On the dirty DB this was MASKED because Contact was pre-populated from
    prior runs. **Fix direction:** the engine must process doors before their children (respect TraversalOrder /
    topological DAG) on the first sync. WORKAROUND: a 2nd sync lands them (parents now in the table) — also the
    incremental path. Real fix belongs in the engine's map ordering.

---

## RESOLUTION (single-pass sync, fail=0, 30/31 syncable objects landed)

Both deep gaps were fixed WITHOUT changing codegen (per constraint):

- **#21 ordering — FIXED in the engine.** `IntegrationEngine.computeSelectedDependencyGraph` now derives the
  parent dependency from the soft-FK `Configuration.parentObjectName`/`ReferencedType` (not only the nulled
  `RelatedIntegrationObjectID`). Doors order before their children → every child lands in ONE pass. (The
  multi-sync need was self-inflicted: nulling `RelatedIntegrationObjectID` for the soft-FK form had collapsed
  the FK dependency graph.)

- **#20 null-PK storage — FIXED in the base connector (NOT codegen).** `BaseRESTIntegrationConnector.ToExternalRecord`
  now stamps the deterministic §4 content-hash INTO the empty single PK field (`Fields = {...raw, [pk]: resolvedID}`).
  The row gets a real, stable storage key, so the generated `spCreate`'s reload-by-PK finds it; identity == PK == hash,
  so re-syncs stay idempotent. The full source record is otherwise preserved (full-record pass-through). Result:
  the 13 always-null-PK objects store (Event children 127 each, ContactCustomFields 340, ScheduledBilling 90).

**Single fresh sync result:** proc=5282, ok=5265, **fail=0**. 30 objects with data; ContactPhone genuinely empty
(source returns 0 phones for this tenant); 7 tenant-disabled (Store/Directory/Certification).

### Framework fixes to port to canon (all integration-scoped, zero codegen change):
1. `IntegrationDiscoveryResolver:1591` — soft-PK column nullable.
2. `TypeMapper.MapSourceType` — unsized string → NVARCHAR(MAX) (generous), not 255 floor.
3. `IntegrationEngine.computeSelectedDependencyGraph` — derive parent dep from soft-FK parentObjectName/ReferencedType.
4. `BaseRESTIntegrationConnector.ToExternalRecord` — stamp §4 content-hash into the empty single PK field.

### Connector + metadata (GrowthZone-specific):
- `GrowthZoneConnector.ts`: $skip/$top, ExtractPaginationInfo total-trust, page-size clamp.
- `.growthzone.integration.json`: 17 corrected paths, soft-FK form (no @lookup/UUID), real PKs.
- Pipeline order: fresh DB → mj migrate → mj codegen → mj sync push (deleteRecord deprecated 26 + seed 38) → manifest regen → restart → ApplyAll → sync.

---

## G. CORRECTION — §4 PK-stamp is NOT idempotent for non-deterministic source records  [FW/C]  (caught by exact dupe audit)

22. **§4 content-hash PK-stamp causes UNBOUNDED duplicate growth when the source record varies between
    fetches.** After fix #20 (stamp `computeContentHash(raw)` into the empty PK), a re-sync of the 9 Event
    children (EventSponsor/Session/Attendee/Task/Calendar/Venue/Exhibitor/RegistrationType/SponsorshipBenefit)
    grew each from 127 → **254** (= 2× the 127 events). rows == distinctHash (so no *hash* collisions), but they
    are **logical duplicates**: the same event's child record produced a DIFFERENT hash on a later sync →
    new key → new row. `computeContentHash(raw)` is only idempotent if `raw` is byte-stable across fetches;
    these endpoints carry a varying field, so it isn't. ContactCustomField (452) + ScheduledBilling (90) stayed
    stable (deterministic source) — so the flaw is source-dependent, not universal.
    - **Contributing issue:** the Event children emit ONE placeholder record per event even when the event has
      no sponsors/sessions (127 = event count, not actual sponsor count) — those empty rows are exactly the
      null-PK rows that then get a varying hash. The connector should likely SKIP empty/placeholder child records.
    - **Fix directions (pick one, all non-codegen):** (a) compute the identity hash over a STABLE projection of
      the record (exclude vendor-varying fields) so it's deterministic; (b) have the connector drop empty
      placeholder child records so there's nothing keyless to stamp; (c) only stamp when a genuinely stable
      natural key is absent AND the record is non-empty. **"Idempotent re-sync" is NOT yet proven for these 9
      objects** — earlier claim retracted. Completeness (single full sync lands everything, fail=0) still holds.

### G.1 — ROOT CAUSE FOUND + FIXED for #22  [C]  (forensic column-diff + live path probe)

23. **Root cause of the #22 doubling = empty-placeholder records from a list endpoint that returns a
    non-list shape.** Forensic `EXCEPT`-diff of the two dupe rows for event 1000571 proved **all 16 business
    columns are NULL in both** (SponsorName, PurchaseId, ContactId, Sponsorship, SponsorFee, Status, Balance,
    Actions, PostActions, …) — the rows differ ONLY in the `EventSponsorId` §4 stamp. Audit across all 9 Event
    children: **254 total / 0 non-empty** — this tenant has ZERO event sponsors/sessions/etc., yet each event
    minted one empty placeholder. Why: the child list endpoints (`/api/events/sponsors?eventId=X`, …) do **not**
    return `{Results:[]}` for an event with no children — they return the **bare event-detail object**. The old
    NormalizeResponse "single detail record" fallback (`return [NormalizeRecord(body)]`) turned that wrapper
    into one record. The wrapper carries volatile per-fetch audit fields (`EventAuditId`/`EventDetailAuditId`)
    in the full passthrough → `computeContentHash(raw)` (the §4 stamp = the soft-PK = the dedup key) drifted
    every sync → new key → new row → unbounded 127→254→381… growth. (The engine's `__mj_integration_ContentHash`
    differed too, but only *downstream* — the volatile stamp got mapped back into MappedFields.)
    - **FIX (connector-only, no engine/codegen change):** `GrowthZoneConnector.NormalizeResponse` now returns
      `[]` for a bare object with no `Results`/`responseDataKey`/root array. Every GrowthZone endpoint is a list;
      a non-list shape = zero records. No placeholder is minted → nothing keyless to stamp → fully idempotent.
      Populated children (if any existed) still arrive as a `Results` envelope and map normally.
    - **Residual (logged, not hit by this tenant):** the deeper §4 weakness — `computeContentHash(raw)` over a
      volatile full passthrough — could still dupe a genuinely-keyless **non-empty** record whose source carries
      a per-fetch field. Not triggered here (the only keyless rows were empty). If a future tenant/object hits
      it, harden via the connector's `ExcludedSourceKeys(objectName)` to strip the volatile key BEFORE the hash
      (the sanctioned passthrough-discipline removal), keeping §4 deterministic. Left as documented risk, not a
      speculative engine change.
    - **Verification:** truncate all growthzone tables → fresh full sync → second full sync → the 9 Event-child
      counts must be **0 and stay 0**, every other table flat. (Running next.)

---

## H. THE META-FAILURES — what the 20-hour build-connector process actually shipped  [ARCH]

The numbered list above is the *symptom* inventory. The point of keeping it is the *architecture* fix:
the agentic pipeline produced a connector that was **broadly wrong AND passed every gate green**. The
individual bugs are not vendor-transcription slips — each is a **missing invariant** in a specific
pipeline stage. These three are the meta-findings the flat list under-states:

24. **A connector where the MAJORITY of API paths were wrong was declared "built / floor-check pass".**
    17 of ~38 object paths were wrong (Section B) — wrong door pattern (`/all`), wrong param style
    (`?eventId=` vs path-segment), one object pointing at *another object's* path (ContactPhone ==
    ContactCustomField), 404s shipped as live. Pagination was capped at one page for EVERY object
    (#1). PKs were declared on always-null fields for 13 objects (#5). The FK form caused push
    rollback risk (#4). Auth was the wrong scheme entirely (#26). **And none of it failed a tier.**
    The headline defect is not any single wrong path — it's that "green" meant nothing about whether
    the connector could actually pull data. A build that ships ~45% wrong paths with a passing
    floor-check has a floor-check that doesn't test the thing that matters.

25. **The credential-free test tiers are CIRCULAR — they validate the connector against its own
    guesses.** T4/T5 mocked fixtures + the spec-contract checks are derived from the SAME
    docs-extracted metadata the connector was built from. So a wrong path, a wrong response shape, a
    placeholder-minting NormalizeResponse (#23), a capped paginator (#1) all pass — the mock returns
    exactly what the connector expects because both came from the same (wrong) source. **Credential-free
    verification that sources its fixtures from the connector's own assumptions can NEVER catch a wrong
    assumption.** Real-data discovery (or a fixture set captured INDEPENDENTLY of the connector's paths)
    is the only thing that breaks the circularity. Every Section-B path bug was invisible until a live
    read-only probe — which only happened in this manual repair, not in the build.

26. **Auth shipped as the wrong scheme.** The original connector did not implement GrowthZone's real
    OAuth2 (password/refresh-token grant, client creds in the body) — it had to be rewritten this
    session. Auth is the one thing that gates EVERYTHING, yet the build's connection-test "passed"
    credential-free (nothing to authenticate against). **A connection-test that can pass without ever
    completing the real auth handshake is not a connection test.**

---

## H.1 — DEFECT → OWNING STAGE → MISSING INVARIANT (the architecture-fix map)

Each row: the defect class, which build-connector stage should have caught it, why the gate passed
anyway, and the one-line invariant whose absence is the actual bug. This is the "fix the process" list.

| # | Defect class | Owning stage | Why it passed green | MISSING INVARIANT (the fix) |
|---|---|---|---|---|
| B,#1,#26 | Wrong paths / capped pagination / wrong auth | `source-auditor` + `code-builder` | docs-only, no live verification; mock built from same guesses | When creds exist, a **live read-only probe of EVERY door** (200 + non-zero/typed shape) is a REQUIRED gate, not optional. A 404/empty/echo door fails the build. |
| #25 | Circular fixtures | `verification-ladder` T4/T5 | fixtures derived from connector's own metadata | Fixtures MUST be captured **independently** of the connector's path assumptions (live capture or third-party spec), or the tier is non-probative and must be labelled so. |
| #22,#23 | Idempotency / dupe growth / empty placeholders | `verification-ladder` | no tier fetches twice | A **mandatory two-pass idempotency rung**: sync → sync → assert row counts flat. Single highest-value missing test. A volatile-field fixture replayed twice catches §4 + placeholder bugs at T4. |
| #23 | Placeholder minted from non-list response | `code-builder` (base class default) | "single detail record" fallback fabricates a row | Base-class default: a **list endpoint returning a non-list shape = ZERO records**, never one. Unsafe default was re-decided per-connector. |
| #5,#20 | PK on null fields → unstorable / unreloadable | `ioiof-extractor` + codegen | PK declared from docs, never checked against a real record | Provable-PK discipline must verify the field is **actually populated** in a real record before emitting `IsPrimaryKey`; soft-PK rows need a reload key (`__mj_integration_ContentHash`) in generated CRUD. |
| #4 | FK form (`@lookup` vs soft) | `ioiof-extractor` / metadata | push-time rollback risk not modeled | FK-form choice must follow the FK-graph rule (sparse→@lookup, dense-forward→soft); the extractor should pick per-graph, not blanket. |
| #6,#8 | String sizing null→255 truncation | `TypeMapper` (framework) | sizing policy floored at 255 | Unknown length = size **generously** (MAX), never the 255 floor — already a stated bounded-typing policy the code violated. |
| #7 | Soft-PK column NOT NULL | `IntegrationDiscoveryResolver` (framework) | `IsNullable:!IsPrimaryKey` ignored soft-PK | Soft-PK columns are **nullable** — sibling code path already did this; inconsistency was the bug. |
| #21 | Children before doors (ZERO_PARENTS) | `IntegrationEngine` ordering | dirty DB masked it (parents pre-populated) | Door-before-child **topological ordering** on the first sync; and tests must run on a **fresh** DB so masking can't hide it. |
| #9,#11,#19 | Stale sproc / manifest / generated-tree churn | `OPS` pipeline | order-dependent, env-specific | Canonical order is **migrate → codegen → push**; generated tree + manifests are build artifacts that must be regenerated/restored deterministically, not hand-nursed. |
| #13 | Stale turbo dist masked a fix | `OPS` | cached dist loaded | Connector/engine changes need a **forced rebuild** before any test asserts behavior; a cache hit on stale dist invalidates the test. |
| #14,#15 | Mid-sync restart zombie / dirty-DB ApplyAll | `OPS` | manual intervention during a run | Never restart MJAPI mid-sync; the per-connector loop must run on a **fresh DB** (dirty state is unsalvageable piecemeal). |

**The five invariants that would have caught the most, in priority order:**
1. **Live read-only probe of every door is a required gate when creds exist** (kills all of Section B + #1 + #26 + #25's circularity).
2. **Mandatory two-pass idempotency rung** (kills #22/#23 and the whole keyless-identity class).
3. **Fresh-DB-only per-connector runs** (un-masks #21 ordering and stops the #15/#19 dirty-state churn).
4. **Safe base-class defaults** (non-list → zero records #23; soft-PK nullable #7; unknown size → MAX #8).
5. **Provable-PK = provably-populated** (kills #5/#20 at extraction instead of at sync time).

These are one-line-per-primitive changes to `floor/` + the verification ladder + two base-class
defaults — i.e. exactly the "architectural finding, not iterate-in-place" category. THIS is the
"much bigger set of errors" the 20-hour process needs fixed: not 23 vendor bugs, but ~5 missing
invariants that let 23 vendor bugs ship green.

### G.2 — REGRESSION from the #23 fix, caught by the 2×-sync count check  [C]  (the two-pass rung earns its keep)

27. **The first #23 fix was TOO BROAD — "non-list response = 0 records" zeroed 7 legitimate
    single-object detail objects.** GrowthZone is NOT "all list endpoints" as the first fix assumed:
    Person (452), Organization (340), ContactCustomField (340), ContactNotes (452), ContactEngagement
    (452), ScheduledBillingUpdate (90), MembershipChange (90) are genuine **single-object detail**
    endpoints — one real record per parent — and they hit the very "single detail record" fallback the
    first fix changed to `return []`. Sync #1 on the broad fix dropped **~2,100 real records to 0**.
    Caught immediately by the post-sync rowcount check (the regressed objects read 0 where the baseline
    had 340/452/90). **This is the #2 invariant (mandatory two-pass + count assertion) catching a
    real regression in real time** — without it, a "green" idempotency claim would have shipped a
    connector that silently lost 7 objects.
    - **Corrected fix (surgical):** `NormalizeResponse` keeps the single-object detail record (restores
      Person/Org/CustomField/Notes/Engagement/ScheduledBilling/MembershipChange) and drops ONLY the
      empty-event-child wrapper, detected by `isEmptyEventChildWrapper` = body carries BOTH `EventAuditId`
      and `EventDetailAuditId` (event-level audit stamps a genuine child/detail record never has).
    - **Lesson for the arch fix:** "all endpoints are lists" was a false simplifying assumption — the
      same class of over-generalization that produced the original wrong-paths. The safe move is a
      *narrow, evidence-scoped* drop (this specific wrapper), never a broad reshape of the response
      contract. Re-verifying now: 2×-sync must show the 7 objects RESTORED to baseline AND the 9 event
      children flat at 0.

### G.3 — #22/#23 idempotency VERIFIED FIXED; ContactWebsite is a completeness gap, NOT a dupe  [C/FW]

28. **2×-sync verification result (corrected surgical fix):**
    - **#22/#23 FIXED & PROVEN:** all 9 event children flat at **0** across sync#1 and sync#2 — the
      empty-placeholder doubling is gone. No table contains duplicate records (every table rows==distinctHash).
      The 7 legitimate single-object detail objects (Person/Org/ContactCustomField/Notes/Engagement/
      ScheduledBilling/MembershipChange) are RESTORED (the #27 regression is gone).
    - **ContactWebsite 40→57 is NOT a dupe** — `rows=57, distinctHash=57` (57 distinct websites). sync#1
      under-fetched (40 of 57); sync#2 completed it to the true 57, then STABLE. It's a per-contact child
      (`/api/contacts/lookup/{contactId}/contactwebsites`, parent=Contact): ~17 contacts' websites weren't
      captured on the first pass (the #21 "child iterates parents before the Contact door fully lands"
      residual), captured on the second. NOT caused by the NormalizeResponse fix (that only touches the
      event-wrapper path). NOT an idempotency violation — it's a first-pass COMPLETENESS gap on one table
      that self-heals on the next sync.
    - **Net:** idempotency goal MET (no duplication anywhere). Residual: one small table needs a 2nd sync to
      reach full completeness — the known #21 ordering pattern, surfacing narrowly here. Logged for the
      arch-fix list (invariant #1: door-before-child ordering must hold for EVERY child, incl. ContactWebsite).

---

## I. THE TWO BIG MISSES — custom-column capture never engaged + write-back never built  [MUST ADDRESS]

These are NOT polish. They are the two things that make GrowthZone an AMS connector, and BOTH were
silently absent while the build (and I) repeatedly called the connector "done / pull-only." User caught
both. Logged here because they MUST be addressed before this connector is actually complete.

29. **Custom-column capture SILENTLY no-opped on every sync — 0 custom fields captured, 0 promoted.**
    The framework's custom-column feature EXISTS and is fully built + tested: `CustomOverflow.ts` +
    `CustomColumnPromotion.ts` (`__mj_integration_CustomOverflow` staging column, `computeUnmappedFields`,
    `planPromotions`, `inferColumnTypeFromSamples`, with `CustomOverflow.test.ts` / `CustomColumnPromotion.test.ts`).
    `DDLGenerator.ts:276/291` adds the overflow column to EVERY integration CREATE TABLE, and the engine
    parks unmapped source keys into it each sync (`IntegrationEngine.ts:3531`).
    - **ROOT CAUSE:** the GrowthZone tables were created **WITHOUT** the `__mj_integration_CustomOverflow`
      column. Verified: `0` growthzone tables have it (they DO have the other 11 `__mj_integration_*`
      columns — ContentHash/SyncStatus/LastSynced/etc. — but not this one). The engine's capture is gated
      `if (hasField(CUSTOM_OVERFLOW_COLUMN))` → with the column absent it **silently skips, no error, no
      log**. So every custom field GrowthZone returned in the full passthrough was dropped on the floor.
    - **WHY the column is missing (needs confirm):** DDLGenerator emits it, yet the tables lack it →
      most likely a stale schema-builder dist at ApplyAll time (the #13 turbo-cache class of bug bit the
      engine already), OR the tables were created by a path/older builder that predated the column and
      `SchemaEvolution` never back-added it. MUST investigate which, then ensure ApplyAll creates the
      column (and SchemaEvolution back-adds it to existing integration tables).
    - **ALSO:** I never ran a verified `DiscoverFields`/capture pass. The connector implements
      `DiscoverObjects`/`DiscoverFields` (delegating to the base/runtime-seed), but the sync ran on the
      seeded Declared metadata only; I checked row counts + idempotency and never checked that customs
      were captured. The 0 overflow columns are the proof it never happened.
    - **TO ADDRESS:** (a) make the overflow column actually exist on the GrowthZone tables; (b) re-sync
      and confirm `__mj_integration_CustomOverflow` is populated for records that carry custom fields;
      (c) run/verify the post-sync promotion (`planPromotions`) mints real columns; (d) add a verification
      rung that FAILS if an integration table lacks the overflow column or if capture/promotion didn't run.

30. **Write-back NEVER BUILT — connector shipped read-only for a bidirectional product.** GrowthZone has
    a real write surface in the docs (`POST /api/contacts`, `POST /api/contacts/{contactid}/representatives`,
    `POST /api/events/{eventdetailid}/eventexhibitor/save`, `POST /api/directory/directories/{directoryid}`,
    `DELETE /api/directory/directories/{directoryid}`, `DELETE /api/calendars/{calendarid}/{auditid}`, …).
    The connector is `SupportsCreate/Update/Delete=false` on ALL 38 objects; metadata has `0` objects with
    any `CreateAPIPath`/`UpdateAPIPath`/`DeleteAPIPath`.
    - **ROOT CAUSE (agent under-reach):** the build's `SOURCE_STUDY.md` marked the write-capable families
      "out-of-scope" and shipped pull-only — the PropFuel-as-3-streams failure: scoped the connector to a
      read slice of a bidirectional system, then I repeated "pull-only" as if it were GrowthZone's nature
      rather than a build gap, and even declared write-back testing "moot."
    - **TO ADDRESS:** extract the real write endpoints per object from the docs; populate the per-operation
      CRUD metadata columns (`CreateAPIPath`/`CreateMethod`/`CreateBodyShape`/`CreateBodyKey`/`CreateIDLocation`,
      `Update*`, `Delete*`); set the capability flags true on writable objects; the generic
      `BaseRESTIntegrationConnector` per-operation CRUD path handles execution (route create through
      `BuildCreatedResult`). Test writes OFF-LIVE (mock) per the standing instruction — never against the
      real tenant — and notify before any live write.

### I.1 — arch-fix map additions (which stage should have caught each)
| # | Defect | Owning stage | Why it passed green | MISSING INVARIANT |
|---|---|---|---|---|
| 29 | Custom-column capture no-opped (tables lack overflow col) | `ApplyAll`/schema-builder + `verification-ladder` | capture silently no-ops when column absent; no tier checks the column exists or that customs were captured | A verification rung that FAILS if any integration table lacks `__mj_integration_CustomOverflow`, OR if a sync of a custom-field-bearing source captured/promoted zero customs. Capture must not silent-no-op — log when the column is absent. |
| 30 | Write-back never built (read-only for bidirectional product) | `source-auditor`/`connector-creator` scope | "study the full nature" violated — write families marked out-of-scope, shipped as the connector's truth | Connector-nature study must record write capability as IN-scope-by-default for a documented write API; an OutOfScope decision on write must be explicit + justified, never silent. "pull-only" must be evidenced, not assumed. |

---

## J. THE REAL CUSTOM-COLUMN BUG — stale nested schema-builder strips the overflow column on EVERY connector  [FW — CRITICAL]

31. **`packages/MJServer/node_modules/@memberjunction/integration-schema-builder` was a STALE 11-column
    copy** (pre-`__mj_integration_CustomOverflow`), and MJServer/MJAPI's in-process RSU loads THAT nested
    copy — not the workspace symlink — so EVERY integration table the RSU creates comes out missing the
    `__mj_integration_CustomOverflow` staging column. The engine's capture is gated
    `if (hasField(CUSTOM_OVERFLOW_COLUMN))`, so with the column absent it **silently no-ops** → zero
    custom-field capture, zero promotion, no error. This is the actual root of #29, and it is **NOT
    GrowthZone-specific** — it silently disables custom-column capture for **every connector on every DB**.
    - **Why it hid:** the workspace dist (`packages/Integration/schema-builder/dist`) AND the source DO
      include the overflow column (DDLGenerator line 276, SchemaBuilder line 334 — 12 columns). Only the
      nested `MJServer/node_modules` copy was stale (11 columns). Grepping the workspace dist showed
      "overflow present" → looked fine; the nested copy is what actually executes. The 38 tables had
      exactly 11 of the 12 system columns — missing only overflow — the fingerprint of this stale copy.
    - **Why ApplyAll evolution didn't back-add it:** SchemaEvolution computes desired-vs-existing from the
      SAME stale 11-col builder → desired==existing==11 → no diff → never adds overflow. (Once the nested
      copy is fixed to 12-col, evolution's desired=12 vs existing=11 → it ADDS the column. Verified: a
      re-ApplyAll after the fix put overflow on all 38 tables + registered the EntityField.)
    - **FIX (this DB):** synced the nested copy's dist with the current 12-col workspace dist; restarted
      MJAPI; re-ApplyAll → overflow on 38/38 tables + 38 EntityFields; sync → **capture PROVEN**: Contact
      200/200 rows have `__mj_integration_CustomOverflow` populated with the unmapped source fields
      (`SelectionId`, `OrganizationContactId`, `ContactType`, `ContactName`, `MembershipStatusTypeId`, …).
    - **DURABLE FIX (framework, separate PR):** the nested stale copy is a workspace-hoisting/version-pin
      artifact. The framework must guarantee MJServer resolves the CURRENT integration-schema-builder (dedupe
      the nested copy, or align the version pin so npm hoists to root). A CI check should assert no stale
      nested `@memberjunction/integration-*` copies exist under any package's `node_modules`. Until then,
      custom-column capture is silently dead wherever this stale copy is present.
    - **ARCH-MAP:** owning stage = framework build/deploy + `verification-ladder`. Missing invariant: a rung
      that FAILS if a synced integration table lacks `__mj_integration_CustomOverflow`, OR if a sync of a
      custom-field-bearing source captured 0 customs. Capture must LOG when the column is absent, never
      silent-no-op (a silent no-op is how a CRITICAL framework regression shipped invisibly).

### J.1 — Promotion runs but per-entity gate no-ops (capture proven, minting not yet)  [FW]

32. **Custom-column CAPTURE is PROVEN end-to-end; PROMOTION is wired + invoked but mints 0 columns.**
    After fixing #31 (stale nested schema-builder), a full sync captured the unmapped source fields into
    `__mj_integration_CustomOverflow` on **452/452 Contact rows** (keys: SelectionId, OrganizationContactId,
    ContactType, ContactName, MembershipStatusTypeId, ImageUrl, …). The post-sync promotion hook
    (`registerIntegrationCustomColumnPromoter` → `IntegrationEngine.invokePostSyncPromotionSafe`, line 497) is
    invoked unconditionally at sync end (verified: only skipped on abort; engine dist current; callback
    registered at boot). Yet two consecutive full syncs minted **0** columns (Contact stayed 60 cols) and
    emitted **no** promotion log.
    - **Narrowed:** `PromoteForSync` loops `syncedEntityNames` and `promoteEntity` returns `[]` at one of the
      SILENT gates (no LogError fired, so it's NOT the entity-map gate): (a) `scanOverflow` returns 0 despite
      452 populated rows — a RunView **server-cache** stale-read is the prime suspect (the cache may hold the
      pre-sync empty Contact result; integration writes go through sprocs that don't fire BaseEntity cache
      invalidation — see CACHING guide); (b) `syncedEntityNames` entity-name format (`"Contacts"`) vs what
      `result.EntityMapResults` emits; (c) `resolveWorkItems` filters all passing keys as already-present.
      Coverage threshold (≥0.5) is NOT the gate — the keys are in 100% of rows.
    - **To pin:** one instrumentation cycle — add a `LogStatus` at each `promoteEntity` early-return (which
      entity, overflowRowCount, passing.length, work.length) → rebuild MJServer → restart → re-sync. ~15 min.
      Most likely fix: `scanOverflow` must bypass the RunView cache (`BypassCache:true`) so it reads the
      freshly-written overflow, OR the post-sync hook must invalidate the entity cache before scanning.
    - **Status:** capture (the half that was silently DEAD framework-wide) is FIXED + PROVEN; promotion is the
      remaining half — invoked, not yet minting. Bounded next-step, not an open hunt.

    Also observed this run: the fresh-DB sync was INCOMPLETE (Contact 452 but per-contact/per-event children
    0) — the #21 door-before-child ordering residual on a first sync (the engine ordering fix didn't fully
    hold on this rebuild). Separate from promotion; logged for the same instrumentation pass.

### J.2 — CORRECTION to #32 + promotion PROVEN minting; backfill (M3 spread) is the narrowed remainder  [FW]

33. **#32 was WRONG: promotion was never "gating" — it never RAN CLEANLY because the environment was
    broken.** Once a clean MJAPI boot + a clean Contact-only sync (no mid-sync restart) was achieved,
    promotion fired on the FIRST try. Diag proof: `PromoteForSync syncedEntities=[Contacts]` →
    `overflowRows=452 passing=14 work=14` → **Contact 60→74 columns**. RSU log: `Promote 14 custom
    column(s) on Contacts`. So CAPTURE **and** PROMOTION-MINT both work end-to-end: 14 pervasive captured
    keys (ContactName, ContactType, SelectionId, OrganizationContactId, MembershipStatusTypeId, …) became
    REAL columns + 106 IOFs + field maps. The custom-column feature — silently dead framework-wide before
    #31 — now captures and promotes.
    - **What blocked the earlier passes (not promotion logic):** (a) the churned `generated.ts` crashed
      MJAPI boot with `Parameter decorators only work when experimental decorators enabled` (905 errors) —
      the regenerated growthzone resolvers break the tsx/esbuild transform where the committed-clean file
      doesn't (NOT a tsconfig fix — adding experimentalDecorators directly did NOT help; it's content/cache,
      keep generated.ts clean to boot, ApplyAll/promotion RSU re-dirties it each time); (b) **zombie runs**
      from restarting MJAPI mid-sync (#14) blocked new syncs; (c) the post-sync hook only runs on a
      *completed* run. The fix was sequencing: restore generated.ts clean → restart → sync → observe, with
      NO restart during the sync.
    - **NARROWED REMAINDER — backfill (M3 spread) doesn't populate the minted columns from EXISTING
      overflow.** After mint, the 14 columns are NULL and the 452 overflow blobs are not cleared. The
      promoter's M3 "spread staged values into the real columns" step did not fire/log. A plain re-sync
      does NOT fix it — content-hash skip sees the records as unchanged and skips the re-map. So historical
      rows' values stay in overflow; only future CHANGED records would populate the new columns via normal
      mapping. **To pin:** the M3 spread needs the post-DDL metadata refresh to land before `row.Save()`
      (the code's own comment warns of "spread-save failures" from a stale field list) — instrument the
      spread block, or force-backfill by nulling `__mj_integration_ContentHash` on the rows so the next sync
      re-writes them through the now-mapped columns. Bounded, separate from the (now-proven) mint path.
    - **NET:** custom-columns went from SILENTLY DEAD (capture no-op, #31) → CAPTURE proven (452/452) →
      PROMOTION-MINT proven (14 real columns). Backfill of historical values is the one remaining narrowed
      item. The forward path (capture → promote → map) is whole.

### J.3 — CORRECTION to #33's "backfill remainder": empty-columns-after-promotion is BY DESIGN (not a bug)

34. **Retraction of the "backfill / M3-spread" framing in #33.** Per the design (confirmed by the user):
    promotion is supposed to **(a) register that the new columns exist** (IOFs + field maps) and
    **(b) run RSU to CREATE the columns (DDL)** — and **deliberately does NOT save the historical values
    into them**. The user must then **restart the server** so the new columns are live, after which they
    **sync in on subsequent runs** via normal field mapping (the captured values stay safe in
    `__mj_integration_CustomOverflow` until then). So the 14 minted-but-empty columns I observed are the
    **CORRECT intended behavior**, not a defect — I mischaracterized it as an open "M3-spread failed"
    remainder. There is no immediate value-spread by design.
    - The only true observation: a plain re-sync of UNCHANGED records won't fill the new columns because
      content-hash skips them — they populate as records change/re-fetch going forward. That's
      change-detection behavior, not a promotion gap.
    - **Net (final, accurate):** custom-columns is WORKING end-to-end per design — CAPTURE (452/452) →
      PROMOTION registers + RSU-creates 14 real columns + maps → restart → values sync in on subsequent
      runs. The only actual BUG in this whole area was #31 (the stale nested schema-builder that made
      capture silently no-op framework-wide), which is fixed.
