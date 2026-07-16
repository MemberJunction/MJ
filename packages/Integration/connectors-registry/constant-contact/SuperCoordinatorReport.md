# Constant Contact Connector — Build Report

- **Run:** `wf_e42a3ed3-ea3` (runID `connector-constant-contact-1783806258859-0be0453e`)
- **Mode:** `redo` → **v1.0.0** (prior was a code-only `ConstantContactConnector.ts` from the 17-connector consolidation, never run through extract/metadata/verification; used only as a regression baseline, never as a metadata source)
- **Credential posture:** [B] credential-free
- **Report ceiling:** `format-verified-no-creds`
- **Final status:** **PartialPass — NOT genuine-green.** Static + mocked-fixture tiers are green; the real-engine behavioral e2e ran but landed ~0 rows (vacuous), so genuine sync correctness is **not proven**.
- **Publish:** OFF (not attempted — PartialPass; outward publish needs explicit approval anyway).
- **Commit:** none (per MJ Rule #1).

## What is SOLID (proven)

- **Metadata — 65 well-formed in-scope objects** (`metadata/integrations/constant-contact/.constant-contact.integration.json`): provable primary keys (PK-defer **42%**, down from 69%; `universalPK='id'` + per-object getById evidence), FK flags+targets, spec-verified HTTP methods, pagination, incremental watermark fields. FK-lookup-qualifier gate clean.
- **Connector code builds clean** — `packages/Integration/connectors/src/ConstantContactConnector.ts` (794 LOC, 35 tests), `BuildClean=true`.
- **Verification ladder GREEN through all applicable static/mock rungs:** T0 StaticValidation, T1 InvariantValidator, T2 CrossProgrammaticConsistency, T3 DocStructureSelfCheck, **T4 MockedFixture**, T7 OpenAPIValidation, T7a EndpointReality. (Live rungs correctly skipped — credential-free.)
- **RealityProbe script** produces a consistent 65-claims/65-verdicts result when run directly (the script is correct).
- **Scope decision (documented):** partner-webhooks, technology-partners, SMS, legacy V2/EventSpot, Zapier/Make recorded as out-of-scope separate routes with reasons. Two action-only endpoints excluded with reason (`activities_contacts_export` = CSV file-download; `contacts_resubscribe` = PUT-only per-contact action).

## What is NOT proven — genuine remaining work (blocks full green)

1. **Behavioral sync fails (the core gap).** With the `className` fix, HybridE2E finally executed a real fresh-SQL-Server sync: 65 tables were created (ApplyAll OK) but the mock sync **landed ~0 rows / 0-of-65 objects covered**. Forward-completeness (drops/dupes), **idempotency** (2nd sync grew tables), **first-sync-completeness** (door-before-child ordering), and **custom-column capture** all failed; 31/31 writable objects never exercised. This is genuine engineering: the connector↔fixtures request/response contract (base URL, route shapes, pagination `_links` envelope, per-object `ResponseDataKey`), DAG ordering, upsert-identity/idempotency, and capture wiring must be debugged against the mock until every object lands rows. Real, uncertain effort — not bookkeeping.
2. **Thin scope vs universe.** The OpenAPI enumerates **240 record types**; the connector emits **65 (27.1%)**. Needs either broader emission or a floor-readable, evidenced scope-justification (the 65 in-scope leaf resources vs the 240 total definitions — many of the 240 are request bodies / sub-schemas / enums, but the accounting must be justified where floor-check reads it).
3. **RealityProbe agent truncation (framework-level).** `reality-probe.mjs` emits 65 verdicts, but the probe **agent** truncates its structured return to 1 verdict across 3 runs despite hardened instructions → `reality-probe-unshaped` (claims 65 ≠ verdicts 1). Likely needs a primitive change (floor-check reads `verdicts.json` directly instead of trusting the agent's inlined array) rather than a connector fix.

## Process notes (for the next iteration)

- The build required 6 workflow resumes. Extraction escalated (PK-defer, half-set FKs, T7 method mismatches) — all fixed at source via `mj-metadata` MCP (evidence-based). Out-of-band metadata corrections initially got clobbered by the `SourceDiff→GapFill` re-extraction; neutralized via the `operatorPrecorrected` script path.
- **Framework bug found + worked around:** the plan invoked `hybrid-e2e` without `className`, so it defaulted to the slug (`constant-contact.ts`) and couldn't load `ConstantContactConnector.ts`. Fixed in the plan; the underlying `hybrid-e2e.workflow.js` default (`CLASS_NAME = className ?? connectorName ?? VENDOR`) is a footgun worth hardening upstream.
- Several floor-check gates (`slots-file-unreadable`, `metadata-file-unreadable`, `extraction-matrix-missing`) fired on **valid on-disk files** — transient floor-fetch agent output flakiness, not artifact defects.

## Recommended next step

Focused **behavioral debugging** — iterate the connector's mock sync (via `/test-connector constant-contact --mode mock`) until every object lands rows (fix the fixtures↔connector request/response contract + DAG ordering + idempotency + capture), then re-run FloorCheck. Do **not** pursue more blind full-workflow resumes; the remaining gaps are engineering, not orchestration. Address the thin-scope justification and the probe-primitive fidelity in the same pass.
