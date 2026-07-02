---
"@memberjunction/testing-integration": patch
---

Integration Test TestType — graduate the remaining expansion suites (Phases C/D/E discrete checks): API Keys, Predictive Studio seams, over-the-wire progress, and the live-model prompt/agent/concurrent/AI-authoring tier.

Continues the graduation (Phases A/B graduated the deterministic-server bundles + merged RLS). Seven more standalone `tsx` suites become first-class metadata bundles + IT records; each `next` script is now a thin dispatcher of a registry bundle.

- **Deterministic server (Active, live-verified against `mj_integrations`):**
  - `api-keys` (AK1–3, IT13) — the API Keys engine end-to-end (Config loads real scopes/apps; a real key's explicit allow/deny rules honored by Authorize). *(The plan mis-classified this as client/MJAPI; it is in-process server. AK3 self-cleans.)*
  - `predictive-studio` (PS1–5, IT14) — Predictive Studio stack seams: ML entity CRUD round-trip, pipeline↔model↔binding lineage, the `'ML Model'` RSP work-type registry resolution, the four PS Actions in metadata, and a clean missing-PipelineID validation. Sidecar-free; only an internal PS5 live-train leg stays `PS_INTEGRATION`-gated (inline). *(Also mostly discrete/deterministic — graduated as normal checks rather than the plan's wrap-as-one.)*
- **Deterministic client (seeded Skip, needs MJAPI — parked like IT03):** `remote-op-wire-progress` (WIRE1, IT15) — over-the-wire RO-3 progress via GraphQLDataProvider → live MJAPI. The dispatcher skips cleanly when MJAPI is unreachable.
- **Live-model tier (`RUN_AGENT_TESTS`, in the "Integration Tests — Live Model" suite):** `prompt-runner` (IT16), `agent-runner` (IT17), `concurrent` (IT18), `remote-op-ai-authoring` (IT19). Each IT is `tier: 'live-model'`, so the driver skips-as-Passed unless `RUN_AGENT_TESTS=1` (verified: the Live Model suite runs 4/4 skip-as-pass); the dispatchers gate at the top too.
- **§8 AI-bootstrap prerequisite landed:** the deep persistence verifiers (`verifyPromptRun` / `verifyActionLog` / `verifyAgentRun`) moved into the package as `src/ai-verify.ts` (re-exported from the barrel); `settle` already lives in `test-runner.ts`. Live-model bundles configure `AIEngine` in their lifecycle Setup — no separate AICtx plumbing needed (only the verifiers were shared).
- **New deps** the graduated bodies call (all already transitive): `@memberjunction/ai-prompts`, `api-keys`, `predictive-studio`, `predictive-studio-core`, `actions-base`, `codegen-lib` (the RO-4 emitter check). `remote-op-wire-progress` added to the driver's client-transport set.
- Verified: package builds; **unit tests 119 pass** (coverage-loss guard extended to all 15 bundles); api-keys 3/3 + predictive-studio 5/5 pass via BOTH the tsx script and the `IntegrationTestDriver` (IT13/IT14 green); live-model dispatchers skip cleanly without `RUN_AGENT_TESTS`; the Live Model suite is 4/4 skip-as-pass under the driver. Additive / back-compat. No `mj:manifest` change.

Deferred (unchanged from the plan): the `ps-inproc-*` / `ps-live-*` Predictive Studio **flow** scripts (single-`main()` flows, no discrete checks) — they require a live Python sidecar + `AssociationDemo` data (`PS_INTEGRATION`), so they are neither runnable nor verifiable in CI today; wrap-as-one would relocate ~1800 lines of bespoke flow logic into the test package for no verifiable gain. They remain runnable standalone. The discrete `predictive-studio` suite (IT14) already provides Predictive Studio coverage in the metadata tier.
