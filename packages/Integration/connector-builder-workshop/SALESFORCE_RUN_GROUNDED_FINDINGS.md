# Grounded findings — Salesforce credential-free run (for the combined-feedback iteration)

Analysis only. No agentic/connector-builder/integration-core changes applied yet — to be implemented
once feedback from the parallel reviewers is combined. Every item below is tied to a concrete
observation from this run (full 1,696-object Salesforce, credential-free, mock-vendor engine e2e).

The throughline the user set: **credential-free is the NORMAL case**, so the bar is "the most
thorough per-connector test possible, in the most simulatory situation possible, with NO creds."
Quality must not drop; where wall-clock or tokens can fall with zero quality loss, take it.

---

## 1. Token efficiency — where it leaks, ioiof-extractor worst

**Observed**
- `ioiof-extractor` is the most expensive stage. The extractor *script* emits 1,696 IOs + ~31K IOFs
  deterministically (cheap). The cost is the **model stages wrapped around it**: `verify-claim` +
  `adversarial-verify` + reviewers reading a 1,696-object / 31K-field emission, plus any stage that
  echoes per-object arrays through `StructuredOutput` (the dual-derive stalls: 56/29 retries on a
  payload that can't fit). Already partially fixed (compact returns), but the *review/verify* read of
  the full emission is the residual leak.
- **Amendment loops chasing the wrong layer**: CodeBuild re-ran 3× against a T1 failure that was an
  *artifact* bug (truncated matrix), not a code bug — 3× the most expensive stage for nothing.
- **Whole wasted cycles from contaminated shared state**: a shared `additionalSchemaInfo.json` keyed by
  every vendor failed CodeGen on *other* connectors' PK-less entities, every run — several fresh-DB
  cycles burned before the cause was found.
- **Large tool outputs**: catalogs/logs pulled into context. (Mitigated this run by grep/node-parsing
  logs instead of cat — but it's not enforced.)

**Proposed (where the change lands)**
- **Verify/review over invariants + a stratified sample, never the full emission** *(connector-builder:
  `extract-iiof-pipeline` + `independent-reviewer`)*. Structural checks (bijection, SQL-type
  normalization, FK-target-resolves, PK-source-matrix) run as a **deterministic script with no model**;
  the adversarial reviewer reads the SOURCE + ~20 objects stratified across families + the anomaly
  histogram. This is the single biggest extractor token win and loses no coverage (the script checks
  100%; the model checks the residual judgment calls).
- **Mechanical O(1)-return lint** *(both frameworks)*: a wrapper that *rejects* any agent return over a
  small byte budget — forces counts + capped sample + disk handoff. Make the existing rule enforced, not
  trusted.
- **Failure-class router before any re-run** *(both)*: classify each failure by who-can-fix
  (code / artifact / metadata / env / primitive) and route there; NEVER re-run CodeBuild for a
  non-code failure. Encodes the "3× wasted CodeBuild" lesson.
- **Deterministic preflight before any model stage** *(both)*: unresolved `@lookup`, raw (non-SQL) IOF
  types, overlong `Description`, cross-connector `additionalSchemaInfo` contamination — all caught this
  run *after* burning cycles. A scripted preflight catches them for ~0 tokens.

## 2. Performance + quality of results (incl. the wall-clock the user flagged)

**Observed**
- **#1 wall-clock leak: ApplyAll triggers a FULL-catalog CodeGen every time.** Phase A `RunCodeGen` =
  **872s (14.5 min)** for 1,696 entities; Phase B's ApplyAll of **9** objects pays *another* full
  CodeGen (~14 min) because CodeGen regenerates the entire entity set, not a delta. Every iterative test
  on a large connector pays ~14 min per ApplyAll. This dwarfs every other cost.
- **Authoritative introspect ran when it shouldn't + was slow**: a full schema refresh described **1,519**
  objects (~2 min) on connection-create even with `E2E_SCHEMA_REFRESH=false` ("Save-hook already
  discovered" auto-ran it). Harmless to the catalog *only* because of two defenses (below) — but pure
  wasted time.
- **ApplyAll field-map creation does LIVE discovery** → `FieldMapCount:0` for all 1,696 credential-free,
  plus 1,696 failed auth round-trips. The schema build correctly uses `buildSourceSchemaFromPersistedRows`
  (no creds); the field-map step does not.
- **Hollow passes**: the first engine-e2e went `ok:true` with **0 rows** ("[Account] fetch failed"
  buried). Completeness assertions pass vacuously on zero.
- **Mock silently served wrong data**: per-object `/sobjects/<Obj>/describe` prefix-fell-back to the
  fieldless describe-global route (no 404, no error) — a correctness trap that would mask a real bug.

**Proposed**
- **Incremental / scoped CodeGen for ApplyAll** *(integration-core / CodeGen)* — regenerate only the
  changed entities, not the whole schema. Biggest wall-clock win, zero quality cost. Failing that, an
  idempotent fast-path: if the table + entity + sprocs already exist and the IOFs are unchanged, **skip
  CodeGen entirely** (Phase A already built all 1,696 — Phase B should not have rebuilt).
- **Field-map fallback to declared IOFs** *(integration-core)* — when live discovery is unavailable,
  build field maps from the persisted IOFs (mirror the schema path). Removes the credential dependency
  *and* the 1,696 failed auths.
- **Non-zero ground-truth assertions everywhere** *(connector-builder tests + floor-check)* — every green
  must assert a count > 0; `processed:0` / `destRows:0` is a RED, not a pass.
- **Mock: exact-match-or-404 for describe routes** *(test framework)* — no silent prefix-fallback; a
  missing per-object describe must 404 so the test fails loudly instead of mapping garbage.

## 3. Test cases — credential-free, much better + actually ENFORCED

**Observed**
- The credential-free **floor (T0/T1/T4/T5) is NOT the bar** and nothing enforces going past it. The real
  proof is the **MJAPI-GraphQL engine e2e against a mock vendor** (what we ran), and floor-check does not
  require it even when it's achievable.
- Fixtures were a thin **2-object** stub. We built a **generator that reads the DEPLOYED schema** and
  emits an FK-consistent, multi-object, multi-page, custom-column, soft-delete dataset — a *simulated
  populated tenant*. That is the right shape and should be first-class, not ad-hoc.
- **No dimension is individually enforced**: full-catalog ApplyAll (the taxonomy DAG), custom-column
  overflow, custom-object discovery, delete-detection (`queryAll`/`IsDeleted`), pagination termination,
  FK-column population, content-hash idempotency — each was checked by hand this run; none is gated.

**Proposed — the big one ("how can it get way better")**
- **New mandatory tier: `T6-rich` simulated-populated-tenant engine-e2e** *(connector-builder + floor)*,
  credential-free, enforced. It must:
  1. **Generate fixtures from the deployed schema** (promote our generator to a *locked primitive*):
     FK-consistent rows across a connected object set, multi-page on a hub, custom (`__c`) overflow
     fields, soft-deletes, a delta pass.
  2. Drive the **real MJAPI GraphQL** pipeline: ApplyAll over the **full catalog** (proves the DAG) +
     StartSync over the rich set + delta CRUD + idempotent re-run.
  3. **Assert, per object**: DB rows > 0, FK columns populated to real parent IDs, overflow JSON captured,
     deleted rows tombstoned, 2nd pass writes 0.
- **Floor-check enforcement that does not exist today**: fail the build when (a) a mock-engine-e2e was
  *achievable but not run*, (b) any green has `processed:0`/`destRows:0`, (c) the FK-connected test set is
  below a breadth floor, (d) custom-col / custom-obj / delete / pagination were not each asserted by a
  specific check. Today these are *trusted*; they must be *gated*.
- **Generalize the two test-framework capabilities we added**: the REST `Match`-on-query (per-object
  routing through one SOQL/REST endpoint) and `{{MOCK_ORIGIN}}` response substitution — make both standard
  so any per-object or response-derived-base connector is simulable.
- **Credential triage as a load-bearing gate**: Salesforce has a free dev org (`self-serve-easy`). The arc
  should detect that and either pursue live, or explicitly record "live achievable, ran mock-engine-e2e
  instead" — never present the floor as if it were live proof.

## 4. Integration framework fixes (surfaced BY doing it credential-free)

1. **ApplyAll field-map creation requires live discovery** → can't build field maps credential-free
   (`FieldMapCount:0` ×1,696 + 1,696 failed auths). Fall back to declared IOFs. *(highest value: fixes
   both correctness AND time)*
2. **Full-catalog CodeGen per ApplyAll** (§2) — incremental/scoped or idempotent-skip. *(biggest time)*
3. **`DiscoveryIsAuthoritative` deactivation gating + the no-refresh path** — a partial/mock or
   connection-create refresh deactivated nothing here ONLY because (a) the describe-global defensively
   listed all 1,696 (no object "absent") and (b) the provable-only overlay treats `fieldsInSource:0` as
   "no opinion." But `E2E_SCHEMA_REFRESH=false` still ran a full introspect ("Save-hook already
   discovered"). The auto-discover Save-hook must respect the no-refresh intent, and only an *explicit,
   complete* comprehensive refresh should ever deactivate.
4. **`IsReadOnly` overload** — it means "don't write back to the vendor," but CodeGen also uses it to
   exclude a field from the entity's own create sproc, so a read-only *source* field (`SystemModstamp`,
   `IsDeleted`) can't be stored (`@IsDeleted is not a parameter for spCreateAccount`). Split the two
   concerns; synced system fields must be storable.
5. **RecordChange logging truncation** — saving an IntegrationObject via `mj sync push` fails
   `String or binary data would be truncated` in the change-log path though the table columns are MAX
   (IO/IOF data itself verified clean). Real framework bug.
6. **Dense forward-ref FK `@lookup` rollback** — a dense graph (Salesforce: 4,913 FK `@lookup`s) rolls back
   the push (siblings uncommitted in-transaction). We stripped to soft-FK, which left
   `RelatedIntegrationObjectID` null and **the DAG flat** — I had to re-resolve all 4,914 edges by hand via
   SQL (`Configuration.ReferencedType` → sibling IO). The push should resolve sibling FK UUIDs in a
   **post-commit second pass** so the DAG is populated automatically.
7. **Deploy preflight as a framework step** — SQL-normalize IOF types, resolve `@lookup`s, width/enum
   checks, credtype-seeded-first, per-connector `additionalSchemaInfo` isolation. Each of these caused a
   rollback or wasted cycle this run.

---

### One-line ranking by leverage (for the combined-feedback triage)
1. **Field-map fallback to declared IOFs** (4-1) — fixes credential-free correctness *and* kills 1,696 auths.
2. **Incremental/idempotent ApplyAll CodeGen** (2 / 4-2) — the ~14-min-per-iteration wall-clock leak.
3. **Enforced T6-rich populated-tenant e2e + the deployed-schema fixture-generator primitive** (3) —
   turns "trusted" into "gated," the user's central complaint.
4. **Verify/review over invariants+sample, not full emission** (1) — the ioiof-extractor token leak.
5. **Failure-class router + deterministic preflight** (1) — stops wasted full-cycle re-runs.
