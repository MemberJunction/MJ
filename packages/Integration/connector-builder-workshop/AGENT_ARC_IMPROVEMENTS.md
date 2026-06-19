# Connector-Builder Agent Arc — Improvement Findings (from the Salesforce run)

Captured from a full Salesforce build + credential-free production-grade hybrid-e2e proof. Three axes
you asked about — **token usage, quality, credential-free production (GQL) testing** — plus the meta:
**the arc must be anxious about testing, never lazy.** These are findings to fold into the agent arc
(not yet applied to the agent definitions — recorded here for the next iteration).

---

## 1. Token usage (where it bled, how to stop it)

- **O(N) StructuredOutput returns are the #1 sink.** Agents echoed per-object arrays (extractor's full
  emission, dual-derive's per-object diff, the matrix) back through the model for a 1,695-object catalog.
  Two stalls burned hundreds of K tokens re-attempting a payload that can never fit. **Rule: every
  agent return is O(1) — counts + a capped actionable sample; the full data is written to disk and read
  back deterministically.** (Fixed in `extract-iiof-pipeline`: dual-derive compact return +
  matrix-from-metadata + objectsExtracted reconciliation. Same pattern must be the default for ALL stages.)
- **Amendment loops chasing the wrong layer.** CodeBuild re-ran 3× against a T1 failure that was an
  *artifact* bug (truncated matrix), not a code bug — 3× the most expensive stage for nothing. **Rule:
  classify a failure by WHO can fix it (code / artifact / metadata / env / primitive) and route there;
  never re-run CodeBuild for a non-code failure.**
- **Contaminated shared state caused repeated full-cycle failures.** A shared
  `metadata/integrations/additionalSchemaInfo.json` (keyed by every vendor) + leftover entity rows made
  CodeGen fail on *other* connectors' PK-less entities, every run, on every DB. We burned several
  fresh-DB cycles before finding it. **Rule: the env-preflight must scan for cross-build contamination
  (shared schema-info keys, foreign-schema entity rows) and isolate per-connector before any ApplyAll.**
- **Large tool outputs.** Parse logs with a tiny node extractor (counts only); never `cat` a 40 KB
  result into context.

## 2. Quality (correctness traps found)

- **Trust persisted truth, never the LLM's echo.** The extractor persisted 1,695 IOs to disk but its
  return truncated to 8 → every downstream count/matrix/gap was wrong → phantom gap-fill. Derive all
  verification artifacts from the metadata file, not the return.
- **Hollow passes are the enemy.** The first hybrid-e2e went `ok:true` with **0 rows** because the
  completeness assertions pass vacuously on 0 ("[Account] fetch failed" was buried). **Rule: every
  green must assert a non-zero ground-truth count; a `processed:0`/`destRows:0` green is a RED flag.**
- **Provable-only / honesty gates work.** The matrix `PkSourceMatrix` check correctly rejected an
  all-`n/a` matrix until a provenance-backed `universalPK` justified the source signal. Keep these
  "earn the green" gates.
- **Metadata authoring defects slip through.** The integration referenced a non-existent credential type
  (`OAuth2 JWT Bearer` vs the real `Salesforce JWT Bearer`) — `mj sync push` would roll back in prod.
  **Rule: a deploy-preflight must resolve every `@lookup` against the target DB before declaring done.**
- **`IsReadOnly` is overloaded** — it means "don't write back to the vendor," but MJ CodeGen also uses
  read-only to exclude a field from the entity's own create sproc, so a read-only *source* field can't be
  stored (`@IsDeleted is not a parameter for spCreateAccount`). The integration table must store ALL
  synced fields; vendor-write-back exclusion belongs to the per-operation body builder. **Framework
  decision needed** (today: connector must emit synced system fields as storable).

## 3. Credential-free production testing (GQL — the primary consumer gateway)

- **The credential-free *floor* (T0/T1/T4) is NOT the bar.** The bar is the **real MJAPI GraphQL
  pipeline against a mock vendor**: `IntegrationCreateConnection → discover → ApplyAll (real
  SchemaBuilder/CodeGen) → StartSync → DB verify`, with delta create/update/delete + idempotent +
  custom-column + custom-object. This run PROVED it works with **zero vendor credentials** — the mock
  replays `fixtures.json`, the connector runs server-side exactly as a production client drives it over GQL.
- **Two fixes were required to make a config-driven OAuth connector mock-testable** (both general):
  1. Connector API URLs must route through the overridable `GetBaseURL()` (not read `auth.InstanceUrl`
     directly) — production-identical, makes the mock tiers work.
  2. The mock server must substitute its dynamic origin into response bodies (`{{MOCK_ORIGIN}}`) so a
     connector that derives its base from a *response* (OAuth `instance_url`, pagination `next` links)
     reaches the mock. Without it, two-phase-OAuth connectors silently never hit the mock.
- **Credential triage must be a load-bearing step, not prose.** Salesforce has a free self-serve dev org
  (`self-serve-easy`) — the arc should detect that and pursue PATH-1 live, or at minimum NEVER present
  the credential-free floor as if it were live proof. Add a floor rule: "live (or mock-engine-e2e) was
  achievable and not run" must block a green.
- **T5's route matcher is weaker than the connector-e2e mock's** (first-match vs longest-prefix), which
  mis-handled a pagination locator under `/query/`. Align them.

## 4. The meta-rule: an ANXIOUS testing arc (never lazy)

Before any "done," the arc must answer YES to all of these, with evidence, or keep going:
1. Did I drive the **real MJAPI GraphQL** pipeline end-to-end (not just credential-free lint)?
2. Did rows actually **land in the DB** (independent count > 0), and did I verify create/update/delete?
3. Did I prove **incremental + idempotency** with numbers (2nd pass writes 0; content-hash populated)?
4. Did I test the framework's **depth** — custom columns (overflow capture), custom objects, pagination?
5. Did I exercise **as many endpoints/methods as the connector exposes** (CRUD, search, get, families)?
6. Did I handle **different client situations** — fresh install (migrate→push→codegen), already-seeded
   (delete-stale), contaminated shared state, dialect (SS now; PG when its baseline is fixed)?
7. For anything NOT covered, did I state it **plainly** (not bury it) — here: bidirectional round-trip
   (needs a stateful/live vendor; write-OUT is unit-tested), live T8 (needs real creds), alt API
   families (unit-level only)?

A connector is "tested" only when 1–6 are evidenced and 7 is honestly enumerated.
