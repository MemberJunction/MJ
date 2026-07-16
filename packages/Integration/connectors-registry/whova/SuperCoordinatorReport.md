# Whova Connector Build — Super-Coordinator Report

- **Vendor:** Whova (Events / event-management platform)
- **Mode:** `new` (v1.0.0) · **Run:** credential-free `[B]`
- **Workshop runID:** `connector-whova-1782977844829-6bb169a3` · **Workflow:** `wf_c7c6308b-d3b`
- **Date:** 2026-07-02
- **Terminal status:** ⚠️ **`EscalatedCodeDeadlock`** (honest escalation — NOT a pass, NOT a silent fail)
- **Production-readiness classification:** **HONEST-NA** (deploys-shape, but no credential-free enumeration door + no provable identity → needs a live credential to verify)

## What completed cleanly
| Stage | Result |
|---|---|
| EnvPreflight (S0) | ✅ ok (generated-churn **waived** as intentional branch drift; isolated infra) |
| BrandResearch | ✅ Whova resolved — Events category, `read-write` capability (Zapier "Create/Update Attendee"), 16 object families discovered |
| Identity | ✅ `WhovaConnector` / `@memberjunction/integration-connectors` / CredType `Whova API Key` |
| SourceAudit | ✅ SOURCE_STUDY built; **8 documented-but-out-of-scope families recorded with reasons** (sessions, speakers, exhibitors/sponsors/leads, tickets-catalog, contacts, surveys/polls/check-ins, messages/community, auth/rate-limits) |
| MetadataWrite + IOIOFExtract | ✅ 3 IOs (Attendees/Orders/Registrants), 11 IOF — the credential-free-provable subset |
| IndependentReview | ✅ converged (no blocking gaps) |
| RealityProbe (unauth) | ✅ 3/3 paths `confirmed` (HTTP 200); ceiling `format-verified-no-creds`; `metadataDelta:false` |
| CodeBuild | ✅ `WhovaConnector.ts` (21KB) built clean; registered in `connectors/src/index.ts` |
| VerificationLadder | **T0 green · T1 RED** |

## Why it escalated (the deadlock)
T1 `InvariantValidator` ran 6 checks — **5 passed** (ThreeWayName, ForeignKeyResolution, CapabilityMethodMatch, ProvableOnly, FullRecordPassThrough) and **1 failed**:

> **`FAIL PkSourceMatrix`** — *"PK defer-rate 100% (3/3) exceeds 50% — producer deferred PK classification across the multi-source sweep."*

All 3 objects lack a provable primary key in Whova's credential-free surface (Attendees → `UK=Email` only; Orders/Registrants → none). The extractor **correctly deferred** PK classification per provable-only discipline (the docs don't declare PKs). But:
- T1 treats a **>50% defer-rate** as a structural failure (a connector where no object has determinable identity can't deterministically sync/dedupe).
- The code+ladder amendment loop can only re-run `code-builder` — which **cannot** add PK evidence that isn't in the docs. So the identical `PkSourceMatrix` failure recurred across 2 attempts → `EscalatedCodeDeadlock`.

`HybridE2E` and `FloorCheck` **did not run** (escalated before them). The connector was therefore **never proven through a sync** — consistent with HONEST-NA.

## Root cause (honest)
Whova's real API is **partner-gated / undocumented publicly**. Credential-free discovery could not obtain: object schemas with PK declarations, real API base URL/paths (the probe hit `whova.com` marketing HTML, 200 for any path), auth scheme, pagination, or rate limits. Three thin objects with no PKs and no API paths is the *ceiling* of what's provable without a credential — not a build defect.

## Architectural findings (for the framework, not this connector)
1. **Deadlock mis-routing:** a `PkSourceMatrix` (metadata/extraction-layer) failure is fed to the **code**+ladder loop, which structurally cannot fix it. It should route T1 metadata-invariant failures back to the **extractor/metadata** amendment path (like the extract loop's slot-routing), not to `code-builder`. As-is it can only ever deadlock.
2. **Keyless-vendor vs `PkSourceMatrix` threshold:** for a vendor that is *legitimately* keyless in its credential-free docs, the connector's sanctioned handling is the **synthetic-PK / content-hash identity fallback** (`ToExternalRecord` §4). T1's flat >50%-defer gate doesn't account for "provably keyless, content-hash-eligible," so it red-flags an honest provable-only emission. Worth a keyless-eligibility carve-out.

## To actually complete this connector
- **Provide a live Whova credential** (`/build-connector whova` → intake **[A]**, or `/test-connector whova --mode live` later). A credential unblocks: real API host/paths, real object/field/PK discovery, pagination + rate limits, and the live read path — moving this from HONEST-NA toward GENUINE-GREEN.
- Absent a credential, this is the correct terminal state: an honest, well-evidenced `format-verified-no-creds` skeleton, escalated rather than shipped green.

## Artifacts (kept)
- `packages/Integration/connectors/src/WhovaConnector.ts` (built clean, registered)
- `metadata/integrations/whova/.whova.integration.json` (3 IOs / 11 IOF, Declared)
- `packages/Integration/connectors-registry/whova/runs/.../output/verdicts.json` (RealityProbe)
- Plan: `packages/Integration/connector-builder-workshop/plans/whova.workflow.js`

## Non-clobber confirmation
This run **escalated before HybridE2E**, so it **never ran codegen** — the shared generated tree was left untouched by Whova (no `mj-gen-snapshot-connector-whova-*`). Isolated infra (`sql-whova:1455`/`MJ_WHOVA_E2E`/MJAPI `:4017`) was never needed. No commit, no push, no `git restore` of user files.
