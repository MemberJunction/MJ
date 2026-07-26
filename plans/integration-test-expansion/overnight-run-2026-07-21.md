# Overnight Catalog Run — 2026-07-20 → 07-21

**Standing orders (Amith, verbatim intent):** do every remaining item in the test catalog overnight, no input requests, full authority to rebuild/restart MJAPI, full-repo unit tests after each wave, commit/push each logical chunk. Done by morning.
**Exclusions/amendments:** PG parity (Domain 8) deferred — NOT tonight. Templates YES; Communication YES but via a **dry-run option built into the providers** (never send real messages; design the seam, thread it end-to-end).
**Branch:** `an-dev-35` (user updated it post-merge of #3185). Stay on it.

## 🚨 HARD CONSTRAINTS (Amith, explicit): NO DESTRUCTIVE ACTIONS
- **Git**: additive commits + plain push to `an-dev-35` ONLY. No force-push, reset --hard, checkout/restore discards, branch deletion, history edits, or other branches.
- **GitHub**: pushes only. No PR/repo mutations beyond that.
- **Filesystem**: ZERO deletions of existing files — all work additive. The runview-matrix rig gets COPIED into bundles, not moved. Temp files only in the session scratchpad.
- **Database**: no new destructive migrations; fixtures self-clean their own tagged rows only (designed behavior).
- Anything that would require a destructive step → SKIP and note in the AM report.

## Method per wave (the ratified loop)
author bundles (client-first; server-only per §3a) → register in suite package index + IT record + suite membership + count table → build → seed metadata (`mj sync push --dir=metadata-optional/integration-test`) → run live via `mj test` → fix product bugs found (log in bug-register, fix per B-series discipline) → proven-to-fail pin where a fix lands → full-repo `npm test` → commit/push → progress log below.

## Waves
| # | Scope | Status |
|---|---|---|
| W1 ✅ | **Domain 0**: graduate `runview-matrix` rig → bundles; `runview-features`, `runquery-catalog`, `runquery-params`, `runquery-features` (since+ValidationFilters FIXED+pinned; CategoryPath deferred) | done |
| W2 ✅ | **D2/D3 completions**: `transaction-groups` (incl. TG scope-bypass fix), `class-resolution`, `scope-enforcement`, `subscription-isolation` | pending |
| W3 | **#2732 leftovers**: EW9 `OriginalMessageChanged` wire check; native-ESM built-dist probe (check:esm extension); live-model conversation-backed `RunAIAgent` + `CompactIfNeeded` lineage (minimal token use) | pending |
| W4 ✅ | **D4/D5/D6**: `ai-cost`, `ai-permissions`, `ai-embeddings`, `ai-providers` (stand-in), `agent-loop-standin`; `actions-pipeline`, `entity-actions`, `scheduling-concurrency`; `entity-server-invariants` | pending |
| W5 ✅ | **Templates** bundle; **Communication dry-run seam**: add `DryRun` to communication provider contract + providers (sendgrid/gmail/twilio/MSGraph/expo-push at minimum: no-op transport, full pipeline execution, result marked DryRun) + `communication` bundle end-to-end with dry-run | pending |
| W6 ✅ | **D9/D10/D13**: `metadata-sync`, `codegen-determinism`, `open-app-lifecycle`; realtime + Predictive Studio deterministic legs; `search` | pending |
| W6b | **Extended-agents suite PROPOSAL** (Amith, 2026-07-21): research+design doc for deterministic agent testing — compaction/carry-forward/artifact-interrogation-by-type (test asset files in metadata-optional: JSON/CSV/XML/PDF/images), payload guards (downstream/upstream/self-write paths), purpose-built TEST AGENTS synced via metadata-optional, skills+plan-mode determinism, scripted-model (no-LLM) strategy, RAG/search for agents. NO LLM-as-judge. Deliverable: plans/integration-test-expansion/agents-extended-suite-proposal.md for review (design only tonight — build after approval). | in flight |
| W7 | **Final hardening**: adversarial sub-agent review round over the night's new bundles; fix findings; full tier + full units green; register/docs/CATALOG counts updated; final commit/push + AM summary | pending |

## Definition of done (AM)
- Every wave committed+pushed, full tier green (all new ITs Active), full unit suite green (turbo all tasks), bug register current, CATALOG.md + quickstart counts updated, this file's table all ✅ with per-wave notes.

## Progress log
(append per wave: what landed, counts, bugs found/fixed, commit SHAs)

- **Setup**: branch synced (HEAD f38e3b314b, #3185 merge), npm i + full build green, MJAPI restarted on fresh dists. 9 authoring agents launched in parallel covering W1 (runview-matrix+features / runquery-catalog+params / runquery-features+register-fixes), W2 (transaction-groups+class-resolution / scope-enforcement+subscription-isolation), W4 (ai-cost+ai-permissions+ai-embeddings+agent-loop-standin / actions-pipeline+scheduling-concurrency+entity-server-invariants), W5 (templates + Communication DryRun seam), W6 (metadata-sync+codegen-determinism+realtime-deterministic+search).
- **W3 partial (inline)**: EW9 OriginalMessageChanged wire check appended to entity-writes (compiles); new ai-prompts `esmInterop.test.ts` guard green 2/2 (static namespace-import lint + plain-Node built-dist probe). Remaining W3: live-model RunAIAgent + CompactIfNeeded lineage (deferred until waves integrate; minimal tokens).
- **W1 delivery 1/3**: `runquery-features` QF1-QF10 authored (ad-hoc SQL contract, MaxRows/StartRow paging, CacheLocal fields, injection guard pinning the since|sqlDate fix, ValidationFilters guards) + ~30 unit tests appended to QueryProcessor (71/71). Suite package.json gains @memberjunction/query-processor dep. Note: runquery-catalog.checks.ts (sibling agent, in-progress) has 1 known tsc error to resolve at integration.
- **Fleet round 2 (post-restart) complete**: all 22 bundles delivered+wired (IT31-IT52, 48 suite members). Shakedown 1: 32/37 → 5 triaged (SE1 schema-false fixture, QP8 filter bypass, AP1 REAL metadata defect B51, RVM14/ESI2 wire message-fidelity B52/B53). Shakedown 2: 46/48 → 2 triaged (CM2/CM3 credential-retry row accounting, ALS2 GETUTCDATE-tick flake). IT42+IT46 verified green individually. Register B49-B62 added (led by SEC-HIGH B49 statusUpdates hijack + B50 cross-tenant cacheInvalidation broadcast). Units 597/597. Commits: cf01f2fdc6, 0add55f71e, c70942aa11 (proposal v2), eefa7b4f70, + final shakedown-fix commit pending tier green.
- **Proposal v2 delivered + pushed** (real models/drivers, shipped agents Query Builder/Sage/Research as standard live members, fallback chains as test targets) — awaiting Amith review.
- **Hardening-pass TODO**: CATALOG.md + quickstart counts (30→52 bundles), adversarial review round, W3 live leg.
