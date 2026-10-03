# Weekly Creative Exploration — 2026-10-03

Three framework-level ideas for MemberJunction, grounded in the codebase, the 30 most recent open
PRs and issues, all fifteen prior ideas, and external research on semantic layers, test-data
privacy, and nonprofit/association data migration. Sixth installment — see the parent
[`README.md`](../README.md).

## Methodology

1. Re-read the full log (2026-08-07 → 2026-09-12; 15 ideas). Noted the 2026-09-14 decision that last
   week's observability / tenant-isolation / drift ideas are not current priorities, so this week
   steers away from detection/observability and toward **everyday usability and trust for
   non-technical staff**.
2. Surveyed open PRs/issues. Themes: Rubrics (just merged — which already covers the "agent
   quality eval" ground, so no eval ideas this week), realtime channels/voice, first-class dashboards
   (#4982), content pipeline (#4986), scoped notifications (#4961), shared-cache correctness (#4956),
   sandbox hardening (#4953), Predictive Studio storage, a cluster of FLS follow-ups.
3. Recon with file-level evidence: no `Metric`/`KPI`/`Goal` entity in core metadata; no masking or
   synthetic-data tooling; no file-import flow in Explorer (Integration covers live connectors,
   `mj sync` is developer-facing). **Dropped a candidate** — offline-first field sync — after finding
   `packages/MobileApp` already ships an offline queue (`data/offline-queue.ts`, `offline-sync.ts`).
4. External research: 2026 semantic-layer summit takeaways, 2026 data-masking/synthetic-data
   practice, and nonprofit/association CRM migration guides (sources in each doc).
5. All three are generic primitives; none requires a new business application.

## The three ideas

### 1. [Governed Metrics & Goals Layer](./idea-1-governed-metrics-goals.md)
Define "Active Members" once — owner, versions, targets, lineage — on top of existing Queries, and
have dashboards and AI agents cite the same certified number. Ends the board-meeting argument over
three different totals. ![](./screenshots/idea-1-metrics-registry.png)

### 2. [Safe Sandbox Data](./idea-2-safe-sandbox-data.md)
Declarative, metadata-driven masked/synthetic data packs: relationally intact, same person → same
fake person, leak-scanned, with a "SANDBOX" chrome band and comms sink. Lets staff train, vendors
build, and agents evaluate without real PII. ![](./screenshots/idea-2-sandbox-pack-builder.png)

### 3. [Import Copilot](./idea-3-import-copilot.md)
A 7-step guided, dry-run-first, reversible file import with AI column mapping, duplicate matching
and a "every row accounted for" reconciliation — for the week an organization moves its data.
![](./screenshots/idea-3-import-copilot.png)

## Not proposed
No vertical apps. No evals/observability (Rubrics just landed; last week's decision stands). No AI
cost analytics, FLS, or realtime work (in flight).

## Process note
Plan-only PRs remain unshipped: of 15 prior ideas, only Accessibility has an implementation attempt
(#3609, stalled). Weeks 2026-09-19 and 2026-09-26 have no log entry.
