# Integration framework — known gaps, forward-compat contract & Phase-2 spec (local tracking)

Local notes only — **not** GitHub issues. Updated 2026-06-06. Companion to
`FRAMEWORK_TESTABLE_CAPABILITIES.md` and `INTEGRATION_ADDITIONS.md`.

---

## 0. Forward-compatibility contract — "no connector-specific change for Phase-2" (CRUCIAL)

### The general principle (custom fields are just the first consumer)

The real architectural asset is NOT "we handle custom fields." It is: **the full, raw API response
is preserved end-to-end and parked at one framework chokepoint, so anything we ever want to do with
"whatever the source returned" is a framework-level addition — never a per-connector one.**

- The full response for every record lives in `ExternalRecord.Fields` (enforced — see below).
- `MappedRecord` carries **both** `ExternalRecord.Fields` (everything returned) and `MappedFields`
  (the shortlisted save), and both meet at the single `FieldMappingEngine.Apply` / `MapSingleRecord`
  point — for every record from every connector (base-fetch or override-fetch).
- So any future feature reads `MappedRecord` there and acts, **blind to connector identity** —
  custom-field capture (§2) is merely the first consumer. The same substrate enables, with zero
  connector awareness: raw-snapshot/audit retention, FK/relationship inference, schema-drift/anomaly
  detection, enrichment, validation — anything that needs "what they actually returned."
- **Honest boundary:** the framework can only ever act on what the API *put in the response*. A field
  a source never returns (null-everywhere, no key) is unrecoverable from row data — only a
  describe/schema endpoint surfaces it. But *everything returned* is preserved and actionable, for all
  connectors, generically and forever.

The contract below is what keeps that door open. Do not let any connector throw away what the source
returned.

### The contract

Phase-2 (framework-level custom-field capture, §2) requires **one** thing from every connector:
the **full source record must reach `ExternalRecord.Fields`** — never a filtered/mapped subset.
The framework's capture diffs `ExternalRecord.Fields` keys against `MappedFields`; anything a
connector drops *before* building the record is invisible and unrecoverable. Persistence is
unaffected — `IntegrationEngine.SetEntityFields(entity, record.MappedFields)` writes only the
**mapped** (shortlisted) fields, so the full record never causes unknown-column writes.

**Current state (surveyed 2026-06-06):**
- **Base-fetch connectors** (use the base REST path): pass-through is **structural** —
  `ToExternalRecord` is `private` + hardcodes `Fields: raw`, and `applyTransformPreservingKeys`
  re-adds any undeclared key a `TransformRecord` override drops (+ warns), with
  `ExcludedSourceKeys()` the explicit, auditable escape for genuine noise. Cannot regress.
- **Override-fetch connectors** (23 of them override `FetchChanges` + hand-build records, because
  `ToExternalRecord` is private): NOT structurally covered. BUT **22/23 already pass the full
  record** (`Fields: r | raw | record | {...item} | response.Body | flat`). The lone exception is
  **`YourMembershipConnector`** (`Fields: { Id, TypeName, SortIndex }` ~line 3625) — a filtered
  subset that drops customs for that object. Pre-existing; fix to a full spread.

**To make it ENFORCED, not just observed (the lever):**
- **Gate — `FullRecordPassThrough`:** flag any connector whose record-building `Fields:` is a
  **narrow object literal** (explicit keys, no spread of the source) instead of the full record /
  a `{ ...source }` spread. The agent already emits the full-record pattern; the gate stops the
  YM-style mistake from recurring. (Reframes/retires `DiscoveryNotHardcoded`, which was aimed at
  the wrong layer — discovery-side sampling, which Phase-2 makes unnecessary.)
- **Convention:** `TransformRecord` may reshape but MUST NOT drop source keys; hand-built records
  set `Fields` to the full record. Honest limit: a connector that fully overrides fetch IS the
  data source, so strict "physically impossible to regress" isn't achievable for it — but
  "the agent emits it correctly + the gate rejects violations + the base guard covers the base
  path" gets to **no per-connector change needed for Phase-2**.

---

## 1. Custom fields with no schema endpoint (the PropFuel class)

Discovery normally enumerates a table's fields from a describe endpoint **without reading data**.
Schema-API sources (Salesforce `describeGlobal`+describe, HubSpot `/crm/v3/properties` + `/schemas`)
find customs **non-row-by-row** — including null-everywhere columns — and that's the preferred path.
A source with **no** schema endpoint (PropFuel: `list`/`download`/`ack` only) can only learn fields
by reading data, and a static catalog then drops customs. Columns are only ever added at
**RSU/discovery time, never during sync** (sync maps to existing columns; `MapSingleRecord` loops
field maps, so unmapped keys are silently dropped at the framework layer).

**PropFuel decision (2026-06-06):** moved on. No schema endpoint; one-account key-diff probe
(`test/propfuel-keydiff-probe.mjs`) found zero extras but one tenant can't prove the schema admits
no customs. Ships with the static **baseline** + an honest limitation note in `PropFuelConnector.ts`.

---

## 2. Phase-2 — framework-level custom-field capture (the real fix; NOT built)

Connector-invariant: 1 additive change + 2 new framework modules + 1 wiring point. **Zero connector
changes** (per §0). Works for batch AND single fetch (both flow through `MapSingleRecord`).

### Pipeline
1. **Capture (in-memory, O(columns) not O(rows)).** `MapSingleRecord` attaches `UnmappedFields`
   (`keys(ExternalRecord.Fields) − active map SourceFieldNames`). A **bucket-hashed coverage map**
   (`Map<columnName → coverageBitmap>` + one sample value per column) discovers the column set and
   its **pervasiveness** — a junk key in one malformed row lights 1 bucket; a real custom column
   lights most. Add a column only above a coverage threshold. Memory stays tiny at any row count.
2. **Extend (post-sync, conditional).** Infer **bounded** types from the sample values (generous,
   never `NVARCHAR(MAX)`) → upsert IOFs via `IntegrationSchemaSync` (`IsCustom=true`, `Discovered`,
   nullable, **never** PK/FK — classification deferred to D4 `SoftPKClassifier`, never fabricated)
   → `md.Refresh()` → **RSU** (`ADD COLUMN IF NOT EXISTS`) → **create the EFMs/field maps** (or the
   loop never terminates — the keys stay "unmapped" and re-capture forever).
3. **Apply (fast, local, NO full sync, NO re-fetch).** Walk the bucket-sharded sparse value matrix,
   batch-`UPDATE` each custom value onto its existing row (matched by `ExternalID`, incl. the
   content-hash identity for PK-less rows), **and recompute that row's content hash** over the new
   `MappedFields`. Pure CPU + local DB; bucket sharding → parallel.
4. **Terminate.** Column now mapped → no longer unmapped → not re-captured. Converges. Crash-safe:
   matrix persists until apply confirmed; RSU idempotent; replayable. Multi-tenant: key per
   `(CompanyIntegration, entity)`.

### CORRECTNESS SPEC — the content-hash blind spot (easy to get subtly wrong)
The skip-unchanged hash is `computeContentHash(record.MappedFields)`
([IntegrationEngine.ts:2683](../../engine/src/IntegrationEngine.ts#L2683)) — over **mapped** fields,
so it is **blind to any unmapped custom column**. Two consequences:
- **False positive:** mapping a new column grows `MappedFields` → every row's hash shifts → every
  row *looks* changed. A full re-sync would "fix" it wastefully — **rejected.** Instead, the Apply
  step (3) **re-baselines** each row's stored hash to the new column-inclusive value.
- **False negative:** while a custom column is still unmapped, its value changes are **not in the
  hash** → skip-unchanged says "equal" even when the custom value changed. So **the content hash is
  NOT authoritative for a column until that column is mapped + re-baselined.** During that window the
  **bucket-hashed matrix is the authority** for the custom columns; authority hands back to the hash
  at the re-baseline moment.

**The invariant that makes re-baseline sound:** the hash recomputed in Apply (3) MUST be
byte-identical to the hash the *next* sync's `MapSingleRecord` would compute for an unchanged row
(same `computeContentHash` over the same full `MappedFields` shape). Then an unchanged row's stored
hash == its next-sync hash → correctly skipped; only genuinely-changed rows differ. No illusory mass
re-write.

**Honest limit:** row-capture (any of these) cannot see a custom column that is **null on every
sampled row** — only a real schema/describe endpoint catches those. Confined to the no-schema-endpoint
case.

### Testing (prove once, don't re-cert every connector)
The whole feature is a **no-op when there are no extra keys** (buffer empty → no signal → no RSU →
byte-identical behavior). So the regression proof is one framework-level golden A/B
(*no-customs ⇒ output identical to today*); all connectors inherit it. The custom path gets its own
targeted tests (capture → extend → apply → re-baseline → terminate → idempotent re-run).

---

## 3. Merkle / partition hash-diff as a DEFAULT mode — BUILT, not wired
HashDiff module exists but only opt-in (`Configuration.partitionReconcile`); promoting it to a wired
default is "complete content-hashing of all tables per layer." Per-record content-hash skip (B3) is
already WIRED.

## 4. Cross-layer pipelined concurrency — NOT implemented
Maps within a DAG layer run concurrently; **layers are sequential**. "True concurrency layer-by-layer"
= overlapping layers where the dependency graph allows (start a child as soon as its parents finish).
Per-layer AIMD concurrency (H2) already WIRED.

## 5. Better rate-limit adaptation — already adaptive; refinement only
H1/H2/H3 WIRED (per-credential token-bucket AIMD, per-layer AIMD, fed by fetch+push). Refinement, not
a missing feature.

> Optimizations in §3–§5 must be **correctness-equivalent** (same output, faster) and wired
> one-at-a-time + A/B-measured, so they don't force per-connector re-testing.

## 6. Promoted columns' UPDATE sproc not regenerated in a long-lived in-process MJAPI — NOT a separate defect; it is #9 (in-process CodeGen schema-cache staleness). Re-inspected 2026-06-12.

**Original framing (WRONG):** "the `CustomColumnPromoter` mints the column but does NOT regenerate
`spUpdate<Entity>`, so discovered fields can't be saved until a full `mj codegen` is run
out-of-band — a missing step in the promoter."

**The promoter DOES regenerate the sproc — by design.** `CustomColumnPromoter.applySchemaChange`
(MJServer) builds the ADD COLUMN DDL and runs it through `RuntimeSchemaManager.Instance.RunPipeline`,
i.e. the RSU pipeline, whose CodeGen step regenerates `spUpdate<Entity>` to include the new
parameters. The promoter even documents the exact pitfall and handles it (lines ~184-189):
"applySchemaChange just added the columns AND had RSU regenerate the spUpdate sproc to include
them — [refresh the in-memory metadata FIRST] so the spread's row.Save() builds a sproc call that
matches the regenerated sproc." This is precisely the **designed RSU-after-sync capture flow**:
discover → overflow → promote (ADD COLUMN + RSU CodeGen regenerates the sproc + refresh metadata) →
the NEXT sync spreads into the new columns. No out-of-band "full codegen" is part of the design.

**What was actually observed, and why it's #9 not a new bug:** in a *long-lived in-process-CodeGen*
MJAPI, the promoter's RSU step reported `RunCodeGen:success` yet `sys.parameters` for the update
sproc lacked the minted columns — i.e. CodeGen ran but its regeneration **missed the just-ALTERed
table** because the in-process runner carried a **stale schema cache** across the process's prior
runs. That is the *same root cause* as #9 (in-process CodeGen reusing first-run schema state). It is
gated to the in-process runner in a re-used process: a **fresh process / DIST boot regenerates the
sproc correctly** — proven on the ORCID dist-boot run, where `spUpdateemployments` etc. regenerated
in the same pass and the post-restart sync spread every promoted column (orgName 2/2, Works title
7/7). Production ApplyAll uses the **child-process** CodeGen runner (fresh each call), so the
designed flow regenerates the sproc and the next sync captures the fields — no manual codegen.

**Action:** none in the promoter (it already regenerates the sproc). Track the residual under #9
(in-process CodeGen schema-cache staleness), confirm whether it reproduces on the child-process
runner, and if so fix it there — never in any connector, and never by adding a step the promoter
already performs.

## 7. Dev-mode MJAPI (tsx) cannot load a populated `src/generated/generated.ts` — run from DIST after any RSU codegen (found 2026-06-12)

tsx/esbuild supports neither parameter decorators without cwd-discovered tsconfig nor
`emitDecoratorMetadata` at all. A freshly RSU-regenerated `generated.ts` (TypeGraphQL resolvers
with `@Arg` parameter decorators + reflection-inferred `@Field` types) therefore CANNOT be
imported by a tsx-booted MJAPI: root-cwd boots die at transform ("Parameter decorators only work
when experimental decorators are enabled"); packages/MJAPI-cwd boots die at runtime
(`NoExplicitTypeError ... 'createdAt' of 'pathlmsCourseItemView_'`). Historical "working" tsx
boots only ever loaded the 20-line stub (boot-order luck — verified: the long-running GZ MJAPI's
schema contains NO generated resolvers). The canonical e2e boot after ApplyAll is therefore:
`turbo build --filter=mj_api` + `npm run build` in packages/MJAPI + `node dist/index.js`
(tsc emits full decorator metadata; the generated resolvers land in the schema — verified live).

## 8. StartSync silently no-ops while `restartRequiredForGraphQL` is pending — misleading success (found 2026-06-12, ORCID + Path LMS hybrid-e2e)

After a custom-column promotion flags `restartRequiredForGraphQL: true`, a subsequent
`IntegrationStartSync` responds `{ Success: true, Message: "Sync started", RunID: null }` and then
starts NOTHING — no CompanyIntegrationRun row, no run events. Both the Path LMS and ORCID e2e
runs lost their second sync to this: the caller polls for a run that never existed. The response
should be an explicit refusal (`Success:false, "restart required after schema update"`) or the
sync should queue until restart — silent acceptance violates the framework's own
no-silent-failure rule. Fix belongs in the StartSync resolver / engine gate.

## 9. In-process CodeGen caches additionalSchemaInfo across runs in one MJAPI process — later connectors' soft-PKs invisible (found 2026-06-12, OpenWater hybrid-e2e)

Within a single long-lived MJAPI process, the FIRST in-process CodeGen run loads
`metadata/integrations/additionalSchemaInfo.json` and the SECOND run (a different connector's
ApplyAll) reuses the cached copy: OpenWater's `WriteAdditionalSchemaInfo` landed its four
PrimaryKey entries at 10:14:35.308 and `RunCodeGen` started the same millisecond — yet CodeGen
reported "Skipping new entity Program ... No primary key found" for exactly those tables, while
ORCID's earlier run in the same process (whose entries were in the file at first load) created
its entities fine. Tables get created PK-less and entity/map creation silently yields
`maps=0` with `Warnings: null` (a secondary defect: map-creation failure should be a WARNING in
the ApplyAll response, not silence). Workaround: restart MJAPI between different connectors'
ApplyAll calls. This is the third instance of in-process-CodeGen state staleness (see #6) —
the family fix is to make each in-process run re-read its inputs (ASI, schema snapshot, sproc
inventory) rather than trusting first-load caches.

### Update to #6 (2026-06-12, ORCID evidence): the sproc-staleness in #6 correlates with the
tsx-booted process — ORCID's 57-column promotion under the DIST-booted MJAPI regenerated
`spUpdateemployments` etc. correctly in the same pass, and the post-restart sync spread
populated every promoted column (orgName 2/2, Works title 7/7) with rows flat. The dist-boot
runbook (#7) therefore also mitigates #6.

## 10. ORCID `record` re-writes once after promotion — RETRACTED as a hash bug; it is correct convergence (re-inspected 2026-06-12)

**Original theory (WRONG):** the ORCID `record` object re-classifies as "updated" while its
siblings `skipped`, so "the hash computed at COMPARE time differs from the hash at PERSIST time
for this shape" — a compare/persist canonicalization mismatch to be fixed in the engine.

**Static code inspection refutes this.** All three content-hash sites in `IntegrationEngine.ts`
are the *byte-identical* call `computeContentHash(record.MappedFields ?? {})` on the *same*
object within a sync (CreateRecord upsert precheck L3092, UpdateRecord matched precheck L3197,
persist L3604), and `computeContentHash` (`ContentHash.ts`) is deterministic (recursively
key-sorted canonical JSON). There is **no within-sync compare-vs-persist asymmetry** — the
filed root cause cannot exist in this code.

**What actually happens (and why it's correct):** the content hash is computed over the
**mapped** fields only (`ContentHash.ts` docstring: "hashes the MAPPED field values, not the raw
external payload"). On sync 1 the ~26 `record` keys are **unmapped** (parked in CustomOverflow,
excluded from the hash). Post-sync-1 promotion mints columns + field maps for them, so on sync 2
they are **mapped** and legitimately enter the hash → the hash differs from the stored one → the
row is re-written **exactly once**, then converges to `skipped` from sync 3 on. The flat siblings
have no promote-on-first-sync delta, so they converge immediately. A single post-promotion
re-write is the schema-evolution path working as designed, not a defect.

**Action: none in the engine.** Do NOT "fix" the hash canonicalization — both paths already share
one function; forcing them further would risk breaking convergence. If a *third* identical sync is
ever observed to still re-write `record` (true non-convergence), re-open with instrumentation that
logs, per record, the stored hash, the recomputed hash, and whether the skip decision used the
hash fast-path or the dirty-flag fallback (the latter can fire spuriously on JSON-string nested
fields when the hash path doesn't engage) — but the 2-pass observation that prompted this entry is
consistent with correct convergence, not a bug.
