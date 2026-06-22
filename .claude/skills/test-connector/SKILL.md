---
name: test-connector
description: Standalone, credential-aware connector TEST harness. Runs the full behavioral verification matrix against a built connector — credential-free by default (the normal case), escalating to live when the broker holds a credential. ALWAYS invoked by build-connector as its terminal gate, and independently invokable for ad-hoc re-testing of an already-built connector (e.g. when a credential arrives later, the vendor changes, or for regression). Triggered by /test-connector.
---

# test-connector

Testing is a **peer of building, not a buried stage.** This skill exists so a connector's *behavior*
is held to the **same rigor the arc already applies to discovery** (provable-only, bijection, adversarial
review). The indictment it answers: the arc is strict about *what the connector claims* and lazy about
*whether the connector works* — and it gets lazy precisely when there is no credential. That asymmetry
ends here.

Canonical references:
- Floor gate: `packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js`
- Behavioral primitive: `packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js`
- Phase table: `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` (`e2eLivePhases`)
- Env runbook: `packages/Integration/connectors/test/CANONICAL_CONNECTOR_SETUP.md`

## Invocation

```
/test-connector <vendor-name> [--mode mock|live|auto] [--db <profile>] [--scratch] [--ad-hoc]
```

- **Always called by build-connector** as its terminal gate (mode `auto`: live iff the broker holds a
  credential, else mock). build-connector is NOT "done" until this skill PASSES.
- **Independently invokable** for ad-hoc re-testing of an already-built connector. This is the
  *provable-connector* path: a connector can be re-proven on demand — when a credential becomes
  available later, when the vendor's spec changes, or as a regression check — **without rebuilding**.
- `--scratch` forces a fresh scratch DB for the deploy-dry-run; default reuses the warm snapshot.

## The non-negotiable law: credential-free is the NORMAL case, never an excuse

A credential is missing on most runs. That is the **expected** condition, not a degraded one. The mock
vendor is a **programmable API** that replays the connector's fixtures — it can measure rows-landed,
idempotency, ordering, capture, deletes, pagination, value-handling, and content-hash. There is **no
behavioral assertion the mock cannot make** except a real write round-trip and true rate behavior.
Therefore:

- **The credential-free matrix is MANDATORY and held to the SAME anti-vacuous bar as a live run.**
  There is no `mode==='live'`-only empirical gate. A mock run that leaves idempotency / ordering /
  capture / rows-landed UNMEASURED fails exactly as a live run would.
- **Credential-free covers ~80% of behavior.** Only write round-trip + true rate behavior need a
  credential. Report that residual *per capability* (below) — never let "no creds" downgrade the whole
  verdict to a vibe.

## Anti-vacuous law (applies in EVERY mode — the core fix)

Any of these is an **automatic FAIL**, credential or not:
- a sync with `processed:0` / `destRows:0` / any per-object rowcount `== 0` where source data exists;
- `delta ok:true` on `Succeeded:0`;
- a single-object ApplyAll standing in for the catalog (hides the DAG + at-scale DDL);
- an outcome assertion (idempotency / ordering / capture / completeness) left `null`/unmeasured;
- a green that reused **stale rows from a prior run** (every count must carry this-run provenance).

A green must mean "observed to work," never "ran without error."

## The matrix — every applicable cell runs and is asserted, or logs a reason

Run in order; each emits a `livePhaseLog` entry (`phaseId`, `nl`, `json`, `pass|fail|skip` + `skipReason`).
floor-check rejects a build where an applicable cell is missing, vacuous, or skipped without a reason.

1. **Deploy-dry-run (the deployability gate).** Push the **full** metadata catalog to a scratch DB (proves
   clean `mj sync push` — no FK-`@lookup` rollback, SQL-normalized types, valid enums/widths, soft-PK
   references a real column, credtype seeded first, **deprecated-seed `integration-object-deletes` applied**),
   then **scoped ApplyAll of an FK-connected representative subset** (proves the taxonomy DAG builds in
   dependency order + at-scale DDL on a real slice). **NOT full-catalog ApplyAll** — materializing a table
   per object is infeasible at scale (e.g. Salesforce 1695 objects); scope to the sync subset, which is also
   prod-correct. NOT a single-object apply either (that hides the DAG).
   > **Multi-connector campaign fast path** (`run-connector-campaign.mjs` / `loop-connectors.sh`): a full
   > `mj sync push` of every vendor's catalog (~5k IO / ~100k IOF) takes ~hours on the per-record save path.
   > For the credential-free matrix, `bulk-insert-connectors.mjs` deploys the IDENTICAL Integration/IO/IOF
   > rows via direct `mssql` bulk insert (~seconds); `reset-to-core.mjs` returns the DB to the core baseline
   > between connectors so each ApplyAll CodeGens a small set. This accelerates only the build-time metadata
   > SEED — the connector's runtime (discover/ApplyAll/sync/CRUD) is exercised over GraphQL exactly as
   > production. See `CANONICAL_CONNECTOR_SETUP.md` § "FAST e2e test-harness bring-up".
2. **Spec-conformance diff (free, deterministic — when a machine-readable spec exists).** Diff every
   declared path / method / param / body / content-type against the vendor's OpenAPI / SDL. This is the
   single highest-value credential-free check and it auto-catches the wrong-paths class. Distinct from
   "fields were parsed from the spec": it asserts the connector's *requests conform*. Gate when a spec
   exists; record `metadata source = OpenAPI-contract-validated` vs `HTML-scraped` for the confidence
   rollup.
3. **Rich fixtures (auto-generated FROM CURRENT METADATA, never hand-authored, never stale).** Generate
   from the spec's example payloads AND the **currently-deployed** IO/IOF schema (object names + PK + fields
   read live, so fixtures can never drift to renamed/removed objects — the openwater/growthzone 0-row trap):
   an FK-connected multi-object set, multi-page on a hub, custom (`__c`/overflow) fields, soft-deletes,
   value-type variety, a schema-drift scenario, a 429 scenario, ≥2 tenant configs. Thin/stale fixtures =
   hollow tests; richness + currency is a floor, not a nicety.
4. **Forward sync + completeness.** Per-object rows `> 0`; record-map 1:1 (no drops/dupes); FK columns
   populated to real parent IDs.
5. **Delta CRUD.** create, update, and **delete-tombstone** each asserted independently (soft-tombstone,
   not hard-delete — history + record-map preserved).
6. **Idempotency.** second full pass = zero growth; **content-hash covers overflow** (a delta touching
   only custom/overflow fields must NOT be dropped).
7. **Custom-column capture + promote.** overflow column exists on every created table; customs captured
   where the source carries them; promotion mints the columns.
8. **Pagination.** follows the cursor AND terminates (no over-fetch beyond the fixture).
9. **Per-capability coverage.** every `Supports*` flag the metadata declares is **behaviorally
   exercised** — a declared capability never asserted is a coverage FAIL, not a footnote.
10. **Discover-objects overlay + deactivation.** Run runtime discovery against the (mock) source and assert
    it **overlays** the static `Declared` metadata: objects present are created/updated, objects **absent from
    an authoritative discovery are deactivated** (`Status='Disabled'`, reversibly — flip back when they
    reappear). Assert *absence > intentional-absence* (a connector that can't discover falls back to static,
    does NOT deactivate). The discover→overlay→deactivate path was previously unexercised.
11. **Discover-columns (3-source) + streaming.** Assert fields surface from each applicable source — a
    discovery/describe endpoint, the data header, and a **streamed sample** — and that the stats-based soft-PK
    is inferred from the streamed sample (so entities aren't dropped when the source returns no PK metadata).
12. **DAG layering.** Assert the object set partitions into dependency **layers with no cycle**, and that
    forward sync applies/syncs **parents before children** along the FK DAG (not just "ran").
13. **Incremental — watermark AND content-hash, isolated (not OR-accepted).** On a watermarked object assert
    the fetch **narrows** (processed drops on the 2nd pass); on a no-watermark object assert **content-hash
    skip** (succeeded=0 on unchanged). Asserting "either narrowed or skipped" is too weak — isolate each.
14. **Merkle / partition hash-diff.** Assert a partition-level rollup hash lets the engine **skip an unchanged
    batch without per-record fetch** (the `HashDiff.ts` path), distinct from per-record content-hash.
15. **Adaptive rate-limit.** Mock a **429 storm** → assert AIMD backoff + recovery + `Retry-After` honored.
    **Calibrate against the credentialed vendor's real 429/`Retry-After`/`X-RateLimit-*` headers** (GZ/PropFuel)
    so the credential-free behavior is shown to match what the live API actually does.
16. **Concurrency (per-layer).** Assert the engine parallelizes work **within** a DAG layer and only advances
    to the next layer once the dependencies it relies on complete.
17. **Error handling / transient retry.** Assert transient errors retry with backoff, a **per-record
    dead-letter** keeps one bad record from sinking the batch, and the **watermark is NOT advanced on partial
    failure** (next run resumes correctly).

> Cells 10–17 are the gaps a prior pass left unproven (discovery-overlay, 3-source columns, DAG, Merkle,
> adaptive-RL, concurrency, retry). They are **applicable-by-default**; skipping one requires a logged
> `skipReason` (e.g. "connector declares no watermark → cell 13 watermark-half N/A"), never silence.

## Credentialed escalation (mode live / auto-with-creds)

When the broker holds a credential, additionally run the live full-creation-pipeline (create instance →
discover → PK-classify → ApplyAll → real sync), the **write round-trip** (create/update/delete a
disposable, run-tagged record, then clean it up in a `finally`), and **true rate behavior** (429
characterization). Vendor side stays read-only except the tagged disposable records. The credential is
held ONLY by the broker; this skill submits a job and parses scrubbed results — credential bytes never
enter context.

## Confidence is reported PER CAPABILITY, never blended

Emit a verdict split by capability, each with its evidence ceiling:
- **read/pull** — `OpenAPI-contract-validated` + mock-matrix-passed → high (~90); `HTML-scraped` → lower.
- **write-back** — mock write-shape proven; live round-trip only with creds (else "machinery sound,
  wiring spec-correct, no record watched to land").
- **rate behavior** — only a credential closes it.

A single averaged number undersells read and blurs the residual. State plainly what only a credential
can close.

## Output contract

Returns `{ pass, mode, livePhaseLog[], assertions, confidenceByCapability, sourceTier }` and writes the
hybrid-e2e + reality-probe journal fields floor-check consumes. `pass` is false if any applicable cell is
missing / vacuous / unmeasured / skipped-without-reason. The skill **cannot self-declare done** — the
floor gate computes it.

## Why standalone (the provable-connector design)

Decoupling testing from building means a built connector carries a **re-runnable proof**. When a
credential arrives months later, run `/test-connector <vendor> --mode live --ad-hoc` to upgrade the
read-only ceiling to a live-verified one — no rebuild, no re-extraction. The same path is the regression
check when the vendor's spec shifts. Building produces the connector; testing produces — and can always
re-produce — the evidence that it works.
