# Week of 2026-09-19

> **Status (Implemented in PR #4612):** All three core framework capabilities have been implemented, unit-tested, and verified end-to-end against a clean SQL Server database. Questionable/over-engineered portions of the initial exploration (`worker_threads` agent execution isolation, DB-wide `$ENC$` table scans, `ConsequentialDecisionDisclosure` statutory legal wrapper, and lossy `TrustGrade` float normalization) were intentionally stripped out. See individual idea docs for full implementation details.

Three framework-level improvement ideas, grounded directly in this week's open GitHub issues,
active PR backlog, and 2026 industry/regulatory research — continuing the recurring exploration
started in [`../README.md`](../README.md).

## Method this week

- Read all five prior weeks' idea docs (`2026-08-07` through `2026-09-12`) end to end before
  proposing anything, to avoid re-proposing Relationship Graphs, Decision Provenance, Accessibility,
  Approval Gates, Resource Governance, Consent & Data Rights, Data Health, Localization, Operation
  Safety Net, Federated Hierarchy Governance, Communication Suppression, Data Access Sentinel,
  Execution Trace Observability, Tenant Isolation, or Agent Drift Detection — all already proposed.
- Pulled the full open PR list (70+ open PRs on `next`) and the 50 most recently filed open issues
  directly from GitHub, and read three issues in full (#4539, #4580, #4602) that looked like they
  pointed at real, undocumented framework gaps rather than routine bug fixes.
- Verified each of the three ideas below against the existing codebase directly (not just the issue
  text) before writing it up, and against every prior week's proposals to state explicitly why it
  doesn't duplicate anything already proposed or in flight.
- Ran targeted web research for 2026 regulatory and industry-practice grounding (state AI
  transparency laws, PCI DSS 4.0 key-rotation expectations, multi-tenant "noisy neighbor"/bulkhead
  isolation patterns) rather than asserting real-world stakes without a source.

## This week's three ideas (and what shipped in PR #4612)

1. **[Execution Blast-Radius Containment Layer](./idea-1-execution-blast-radius-containment.md)** —
   a single misconfigured AI agent can exhaust the Node heap and crash the entire shared MJAPI
   process for every user and every tenant on it (filed as **#4539**).
   - **Shipped:** `PayloadSizeGuard` (`packages/AI/Agents/src/payload-size-guard.ts`) wired into
     `BaseAgent` (`DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES = 16 MiB`, per-run `maxPayloadBytes`,
     cross-sub-agent `maxTreePayloadBytes`, and `peakPayloadBytes` tracking on `AgentTreeBudget`),
     plus an explicit `--max-old-space-size=8192` ceiling in `packages/MJAPI/package.json`.
   - **Stripped out:** `worker_threads` bulkhead isolation (fights MJ's in-process singleton/metadata
     architecture) and lowering `DEFAULT_ABSOLUTE_MAX_ITERATIONS` below `5000` (which would penalize
     legitimate multi-step research/orchestration agents when the actual failure mode is byte size).

2. **[Encryption Key Lifecycle & Envelope Governance](./idea-2-encryption-key-lifecycle-governance.md)** —
   MJ's field-level encryption engine previously omitted the key version from `$ENC$` envelopes and
   only rotated `EntityField` columns with `Encrypt = 1` (**#4580**).
   - **Shipped:** Self-describing versioned envelopes
     (`$ENC$<keyId>:<keyVersion>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`) with full backward
     compatibility for unversioned v1 envelopes and `$v<version>$` segments; version-aware key
     lookup in `EncryptionEngine.Decrypt`, `EnvVarKeySource`, and `ConfigFileKeySource`; and
     `RegisterEncryptedStore` / `GetRegisteredEncryptedStores` on `EncryptionEngine` integrated into
     `RotateEncryptionKeyAction`.
   - **Stripped out:** Expensive DB-wide arbitrary table scans searching every string column for
     unregistered `$ENC$` prefixes.

3. **[AI Confidence & Explainability Disclosure Layer](./idea-3-ai-confidence-disclosure-layer.md)** —
   unifies the confidence and rationale signals across Duplicate Detection, Content Autotagging, and
   Predictive Studio into a single contract and reusable Angular L1 components.
   - **Shipped:** `AIConfidenceSignal` and pure adapters (`FromDuplicateVerdict`,
     `FromContentItemTag`, `FromTrustVerdict`, `DeriveConfidenceBand`, `NormalizeProbabilityScore`)
     in `@memberjunction/ai-core-plus`, plus standalone `<mj-ai-confidence-badge>` and
     `<mj-ai-explanation-panel>` components in `@memberjunction/ng-ui-components`.
   - **Stripped out:** `ConsequentialDecisionDisclosure` statutory legal-boilerplate wrapper and
     lossy float conversion of coarse grades (`TrustGrade` stays on `scale: 'grade'` with `rawScale`
     intact and no fabricated probability score).

## Format

Each idea document follows the established structure: the problem framed for the world first, an
explicit "what already exists" section proving it against the actual codebase and against every
prior week so nothing is duplicated, the shipped implementation and what was intentionally stripped
out, and a link to a full HTML UX mockup with a rendered screenshot.
