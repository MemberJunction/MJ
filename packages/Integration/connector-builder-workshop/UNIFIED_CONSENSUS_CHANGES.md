# Unified consensus — connector-builder changes to commence (HOLD EXECUTION)

Synthesis of three independent credential-free runs: **Salesforce [SF]** (1,696 objects), **iMIS [IM]**
(216 objects), **Hivebrite [HB]** (98 objects / 1,185 fields). Tags show which runs converged on each
item — convergence = confidence. NOTHING is implemented yet; this is the implementation spec to apply in
one pass (agentic = local; connector-builder = commit+push its branch) once the direction is greenlit.

Targets: **[CB]** connector-builder workflow/primitives/floor · **[AG]** agentic harness (local) ·
**[CORE]** integration framework (engine / CodeGen / sync-push / RSU).

---

## A. The five consensus changes (all/most runs converged — commence today)

### A1 — Split claims: mechanical→code (zero LLM) vs ambiguous→LLM  [SF][IM][HB — all #1]  ·  [CB]
The ioiof-extractor leak is **not** the script; it's an LLM re-confirming parser-certain facts.
- **Mechanical (parser-certain → deterministic check, NO LLM):** field name/type/nullability read from
  the spec; capability **bijection** (`SupportsCreate = path && method`); "operation-only endpoint → not
  paginatable". [IM] proved `SupportsCreate=None` on all 216 IOs survived **7 rounds** + a catalog-wide
  instruction — a tautology the LLM won't reliably derive. Move these into **§0b code enforcement**.
- **Ambiguous (→ LLM adjudication only):** the hard-constraint flags where the source is silent/
  contradictory — `IsPrimaryKey`, `IsForeignKey`, watermark field. [HB] showed this set is tiny
  (~77 PK + ~62 FK of 1,185) → ~10× smaller review surface, **zero quality loss**.
- **Extractor returns COMPACT STATS only**; the file is source of truth. Fixes the truncated-return
  phantom gap-fill ([IM] return → `['__SEE_FILE__']` → SourceDiff saw "1 of 216" → full re-extract;
  [SF] same on dual-derive). Reconcile SourceDiff/matrix **from the file**; reviewer **diff-scopes** on
  amendment rounds (only the changed delta, not the whole catalog).
- **Impact:** roughly halves→10×'s extractor cost AND collapses the amendment loop 7→1–2 rounds.

### A2 — Deterministic-as-code + failure-class router  [IM][SF][HB]  ·  [CB][AG]
- **Anything deterministic is code, never a fallible LLM/StructuredOutput call.** [IM] lost **3 whole
  runs** to StructuredOutput flakes on trivial steps (haiku symlink-staging; a `test -f`). Each abort
  wasted a full env bring-up.
- **Failure-class router** before any re-run: classify (code / artifact / metadata / env / primitive) →
  route there; **never re-run CodeBuild for a non-code failure** ([SF] re-ran it 3× against an artifact
  bug). Stronger model reserved for the few genuine reasoning steps [IM][HB].

### A3 — Enforced credential-free mock matrix as a HARD floor-check gate  [SF][IM][HB — all "the biggest gap"]  ·  [CB]
Today a connector goes **green structurally while the real rows-landing hybrid-e2e never runs** ([IM]
orchestration flakes blocked it; [HB] green without ever running A/B/C/F/I/J; [SF] trusted not gated).
- Make the real MJAPI-GraphQL engine-e2e **mandatory**: full-catalog ApplyAll (DAG) → forward
  completeness → delta **create/update/delete-tombstone** → idempotency → watermark → content-hash →
  value-handling → custom-col **capture+promote** → pagination. **Wire the §6 `livePhaseLog`
  enforcement that exists on paper but isn't actually enforced.**
- **Anti-vacuous = automatic FAIL:** delta `ok:true` on `Succeeded:0`, a 0-row sync, a single-object
  ApplyAll, any `processed:0`/`destRows:0` green. Each applicable cell must pass or log a reason.

### A4 — Auto-generated fixtures + a richness floor  [SF][HB][IM]  ·  [CB]
Fixtures were hand-authored and thin (2 objects, no deletes/value-types = hollow tests).
- **Auto-generate `fixtures.json` as a build artifact** — from OpenAPI **example payloads** where the
  spec has them [HB], and from the **deployed schema** for FK-consistent multi-object data ([SF]
  generator → promote to a **locked primitive**). Every connector gets a mock for free; the matrix runs
  on every connector automatically.
- **Fixture-richness floor-check:** must encode deletes, value-type variety, custom fields, FK-connected
  objects, a schema-drift scenario, a 429 scenario, and ≥2 tenant configs.

### A5 — Warm-DB snapshot + cheap inner-loop tier (THE time win)  [IM][HB][SF]  ·  [AG][CORE]
The two biggest time sinks were self-inflicted and fixable with **zero quality cost**:
- **Snapshotted migrated+codegen'd DB image** so e2e iterations start **warm** instead of rebuilding the
  world (fresh DB + migrate + codegen + MJAPI, ~minutes each) [IM — "highest-leverage time win"].
- **Cheap validation tier** (one-object / stubbed ApplyAll) for inner-loop assertion changes before the
  full pipeline [HB ran the full 55-table e2e **5×** to test one-line fixture changes].
- **Incremental/idempotent ApplyAll CodeGen:** skip the rebuild when table+entity+sprocs exist and IOFs
  are unchanged [SF — full-catalog CodeGen = **872s** per ApplyAll, paid again for a 9-object apply].

### A6 — Source-tier provenance → contract-validation gate + per-capability confidence verdict  [HB explicit; SF/IM implied]  ·  [CB]
The confidence-calibration miss: the build conflated "metadata **read from** an OpenAPI" (parser-certain
schema) with "requests **validated against** the OpenAPI" (contract conformance) — and reported one
blended number that hid a strong read signal behind an unexecuted write/rate signal.
- **Run OpenAPI/SDL contract-validation as a gate when a machine-readable spec exists** (credential-free
  technique #6, not currently enforced): assert every connector request (path / method / params / body /
  content-type) conforms to the spec, and every response model matches a spec schema. This is the cheapest
  move that anchors read/pull confidence — and it's distinct from "we parsed the fields."
- **Report confidence SPLIT BY CAPABILITY, never blended:** read/pull (OpenAPI-contract-validated → ~90),
  write-back (no creds → ~50, "machinery sound, spec-correct wiring, no record watched to land"), rate
  behavior (no creds → ~50). A single averaged "50–55%" undersells read and blurs the residual.
- **Roll provenance up into a legible verdict per connector:** "metadata source = OpenAPI-derived +
  contract-validated" vs "HTML-scraped" — surfaced in the report as the confidence anchor, not buried
  per-claim. State plainly what only a credential can close (write round-trip, true rate behavior).
- Composes with A4: fixtures auto-generated from the spec's own example payloads are *themselves* a
  contract-conformance artifact.

---

## B. Deploy-dry-run / preflight gate  [HB "highest-value quality lever"][SF][IM]  ·  [CB][CORE]
The build pipeline **never deploys the metadata** — every real defect surfaced at human-test time, not
build time (FK rollback, enum/column mismatch, soft-PK on a non-column, flat DAG).
- Add a **deploy-dry-run pipeline rung**: push to a scratch DB + ApplyAll, as a **gate before "done."**
  Catches all of the above at build time. (Exactly the work done by hand in all three runs.)
- Plus a **deterministic preflight**: SQL-normalize IOF types, resolve `@lookup`s, width/enum checks,
  credtype-seeded-first, per-connector `additionalSchemaInfo` isolation.

---

## C. Integration framework bugs (union, ranked by consensus × leverage)  ·  [CORE]
1. **Post-commit soft-FK resolution** [SF][IM][HB — all] — resolve `Configuration.ReferencedType` →
   `RelatedIntegrationObjectID` in a **second pass after all objects commit**. Fixes dense forward-ref
   `@lookup` rollback **and** the flat DAG. [SF] re-resolved **4,914** edges by hand; [HB] 62 rolled
   back; [IM] needs two-pass push. THE recurring dense-graph failure ([[feedback_connector_metadata_deploys_cleanly]]).
2. **Content-hash must cover overflow** [IM — DB-confirmed] — a delta touching **only** custom/overflow
   fields is silently dropped. Global idempotency fix; ship with a regression test.
3. **`additionalSchemaInfo` per-run dedupe-replace** [IM][SF] — shared accumulator → CodeGen chokes on
   other connectors' PK-less entities. Regenerate-dedupe-replace per connector run.
4. **ApplyAll field-map fallback to declared IOFs** [SF] — live-discovery dependency gave
   `FieldMapCount:0` ×1,696 + 1,696 failed auths credential-free. Mirror the schema path
   (`buildSourceSchemaFromPersistedRows`).
5. **Incremental/idempotent ApplyAll CodeGen** [SF] (also A5) — the per-iteration wall-clock leak.
6. **Default DeleteBehavior = soft-tombstone** [HB — DB-confirmed hard-delete of `5002`] — preserve
   history + record-map by default.
7. **Nested-PK → descend to scalar `.id`** [HB, known [[project_connector_nested_pk_dupe]]] — discovery
   picks an object-valued field as PK → duplicate rows. Generic engine fix.
8. **`IsReadOnly` overload** [SF] — split "don't write back to vendor" from "don't store in MJ table";
   read-only **source** fields (`SystemModstamp`, `IsDeleted`) must be storable.
9. **RecordChange truncation** [SF] — `String or binary data would be truncated` in the change-log path
   on IO save (table columns are MAX).
10. **Promotion value-spread** [IM] — sproc-regen lag under RSU `SkipRestart` + order-dependent
    `NoExplicitTypeError` on boot (type-graphql emission). Minting works; auto-spread doesn't.
11. **`mj sync push` optional chunked data-sync** [IM][SF] — native/optional batch data load into entities.
12. **`DiscoveryIsAuthoritative` respects no-refresh** [SF] — the auto-discover Save-hook ran a full
    1,519-object introspect despite `refresh=false`; only an explicit *complete* refresh should deactivate.

---

## D. Preserve (do not regress)  [IM][HB]
**Provable-only.** It found real bugs instead of faking green (the deactivation overlay protected the
[SF] catalog; the honesty gates caught the all-`n/a` matrix). Every change above must keep it.

---

## Meta-principle the data confirms: efficiency wins here are QUALITY wins, not trade-offs
- Mechanical-off-LLM (A1) is **cheaper and removes a hallucination surface** on certain facts.
- Deploy-dry-run (B) + enforced matrix (A3) cost **compute, not expensive LLM tokens**, and catch defects
  earlier — saving the human round-trips that dominated all three sessions.
- The only pure speed-up that touches nothing else: warm-DB + cheap inner loop (A5).

## RUN CONFIRMATION (SF Phase B, 2026-06-15) — catalog-scale ApplyAll CodeGen is a hard blocker, not just slow
The rich 9-object depth sync **never landed**: `ApplyAll → In-process CodeGen FAILED after 871s` with
*"Entity generation completed with batch failures"* + *"Error managing SQL scripts and execution"*. A
**9-object** apply regenerated the **entire 1,696-entity catalog** (selection plan pulled FK
dependencies) and the entity-generation batch failed at scale. This **confirms iMIS's prediction** that
catalog-scale ApplyAll surfaces a CodeGen/type-graphql limit — now reproduced at 1,696 entities. It
upgrades **A5 / C5 from "performance" to "correctness blocker"**: a small apply MUST NOT regenerate the
whole catalog (incremental/scoped CodeGen, or skip-when-unchanged), both because it's slow AND because
the full regen *fails* at scale. (Breadth/DAG — Phase A full ApplyAll — already succeeded; it's the
*repeat* full-regen on the next apply that dies.) Anti-vacuous note for A3: the verifier initially showed
`Account=3` — **stale rows from a prior run**; per-object "this-run" provenance is required so a stale
count can't read as a pass.

## Commence-today sequencing (4 parallel tracks, no interdependencies)
- **Track 1 [CB] extractor:** A1 (mechanical/ambiguous split + compact return + reconcile-from-file +
  diff-scoped reviewer) — biggest token win.
- **Track 2 [CB] enforcement:** A3 (wire livePhaseLog gate + anti-vacuous) + A4 (fixture generator
  primitive + richness floor) + B (deploy-dry-run + preflight) — biggest quality/coverage win.
- **Track 3 [AG/CORE] time:** A5 (warm-DB snapshot + cheap inner tier + idempotent ApplyAll CodeGen) +
  A2 (deterministic-as-code + failure-class router).
- **Track 4 [CORE] bugs:** C1 (post-commit FK), C2 (content-hash overflow), C3 (additionalSchemaInfo),
  C4 (field-map fallback) first; C5–C12 next.
