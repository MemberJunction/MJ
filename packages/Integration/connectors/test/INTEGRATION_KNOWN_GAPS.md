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

## 6. Custom-column promoter: minted columns don't reach the entity's UPDATE sproc in the same pass — FRAMEWORK DEFECT (found 2026-06-12, Path LMS mock-floor hybrid-e2e)

The post-sync `CustomColumnPromoter` correctly detects overflow keys, mints typed columns via its
own RSU migration (`ALTER TABLE ... ADD [endDate] DATETIMEOFFSET NULL`), and the EntityField
metadata rows appear — but `spUpdate<Entity>` is NOT regenerated with the new parameters by the
promoter's own in-process CodeGen pass. Every subsequent spread-save then fails with
`@endDate is not a parameter for procedure spUpdateCourseItemView` until a FULL `mj codegen`
is run out-of-band (after which the very next sync spreads cleanly — proven: PLMS e2e sync went
`updated:3, spreadEnd=3/3` immediately after the repair codegen). Repro evidence:
`/tmp/plms-mjapi*.log` runs of 2026-06-12; the promoter's RSU step list shows
`RunCodeGen:success` yet `sys.parameters` for the update sproc lacks the minted columns.
Suspected cause: the promoter's in-process CodeGen scopes regeneration to a diff that misses the
just-ALTERed table (ordering or schema-cache staleness within the same process). Workaround in
e2e: run `mj codegen` + rebuild + restart after first promotion. Fix belongs in the RSU/CodeGen
in-process runner, NOT in any connector.

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
