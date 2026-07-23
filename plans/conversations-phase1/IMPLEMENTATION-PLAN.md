# Composed Shell — Implementation Plan

> Drafted 2026-07-22. Companion to `hub-prototype/CONTINUITY-LEDGER.md` (what must be covered)
> and `hub-prototype/MJ Composed Shell - Functional Mockup.html` (what it must look like and
> do). This doc is the HOW and the ORDER. Owner: Matt (design authority + review gates);
> plumbing/architecture/tests executed by Claude per slice. Reviewer routing: UX slices →
> rkihm-BC; architecture slices (S0 ADR, S8 cutover) add AN-BC.

## 0. Ground rules

- **Branch model (Matt's calls, 2026-07-22 + simplified 2026-07-23):** one long-lived
  integration branch — **`conversations-shell`** — cut from `conversations-phase1-prototype`
  (design docs and code travel together), tracking `origin/conversations-shell`. **Slices
  commit DIRECTLY to this branch** (single-builder workflow; the slice-spec + in-session
  review gates replace per-slice PRs — S0 briefly used a slice branch/PR (#3263), folded in
  and retired). One final PR merges `conversations-shell` to `next` at cutover — that PR is
  where CI gates (unit tests, `check:ui`) run against the whole body of work, so every slice
  still runs them LOCALLY as part of its definition of done. **Discipline that makes this
  safe: merge `next` into `conversations-shell` at least weekly** (and the morning any slice
  starts), running the BASELINE drift-check rule each time. Exception: **schema rides ahead**
  — the D-S9 migration goes to `next` via its own normal PR (CodeGen and other lanes depend
  on schema landing in release flow, not sitting on a feature branch).
- **The mockup is the acceptance spec.** A slice is reviewable when its surfaces match the
  mockup's behavior and states (light + dark, per persona where relevant). Full-page
  screenshots at review, per standing practice.
- **The ledger is the completeness gate.** Each slice PR description lists the ledger rows it
  discharges (MOCKUP rows) or carries (CONTRACT rows), and §E gates anything backend-blocked.
- **Per-slice definition of done:** package builds green · unit tests updated + run · a
  changeset · `npm run check:ui` clean · screenshots reviewed by Matt · ledger rows ticked.
  The repo's deterministic integration tier runs before S8 declares done (and any slice that
  adds server-side capability adds its IT check per repo policy).
- **No behavior change for embedders until S8.** All new shell code is inert (unmounted)
  until the cutover slice swaps the Explorer wrapper. The chat-area feature-gate contract and
  every §C4 host contract stay untouched through S1–S7.

## 1. Architecture (ADR-1 — proposed, ratify at S0)

**New shell components live in `@memberjunction/ng-conversations`; Explorer mounts them via a
thin resource wrapper.** Rationale: the 3-layer doctrine (widget owns conversation surfaces,
hosts stay thin); Generic packages can't import Router, which forces the right shape — an
internal navigation state model (extending the existing `NavigationTab` union to
`frontdoor | room | chat | chats | projects | collections | routines` + `settingsOpen`
overlay state), with the Explorer wrapper translating state ↔ URL for deep links. Embeds and
future hosts get the shell for free; the orphaned `mj-conversation-workspace` is retired at
S8, not revived. The mockup's `state.view` dispatch is the direct reference for this model.

Component skeleton (names indicative): `mj-composed-shell` (frame: sidebar + main outlet +
settings slide-in + toast host) · `mj-shell-sidebar` · `mj-front-door` · `mj-project-room`
(+ tab components) · `mj-chats-surface` · `mj-projects-surface` · `mj-collections-surface`
(wraps existing collections machinery) · `mj-routines-surface` (wraps `ng-user-routines`) ·
thread = existing `mj-conversation-chat-area` reused via slots.

## 2. Slice sequence

| # | Slice | Scope (mockup ref) | Key dependencies / notes |
|---|---|---|---|
| **S0** | **Preflight** (small) | Ratify ADR-1 (Amith) · file + build the two widget extension points: **rail slot** on chat-area, and **verify** whether `ng-composer` already provides the composer seam (BASELINE §C1) · re-run drift check · post the PR #2953 package if not done | Blocks nothing else for long; do first |
| **S1** | **Shell frame + sidebar + Settings** | `mj-composed-shell` frame, two-path sidebar (nav + Pinned/Recents, quiet dots), S1 Settings slide-in (Show Projects toggle via UserInfoEngine `mj.conversations.showProjects.v1`, density, default agent, appearance, refresh-cache row), F0 teaching line, F0x opt-out state | The skeleton everything plugs into. Old shell untouched; new shell reachable only via a dev route/flag for review |
| **S2** | **Chats surface (W0a)** | Grouped/flat, filter, select mode, bulk ops, drag-to-group | Re-presents existing list machinery; sidebar mgmt actions migrate here per mockup |
| **S3** | **Front Door (F1/F0/F0x)** | Composer-first landing; Needs-you (agent requests + failed runs), Continue (recent conversations), Ran overnight (routine runs) | All queries over existing entities. **Read-status lines & unread dots EXCLUDED until D-S9 ships** (§E) — layout leaves their slots |
| **S4** | **Project Room (P1–P4 + Runs)** | Room shell, Overview (orientation + Runs fold + Needs-you + memory + artifacts panels), Conversations, Memory ledger (existing note entities), Artifacts tab | Greenfield surface. Members/roles UI EXCLUDED (§E — Projects v1 membership model); avatar slots reserved. "Last here" excluded (D-S9) |
| **S5** | **Studio Split relayout (T3)** | Hoist artifact pane hosting from inside chat-area to shell level; mount `mj-artifact-viewer-panel` per its §C4 contract; version trail; Analyze; split/resize/maximize persistence keys preserved verbatim | **Riskiest refactor** — isolated on purpose. Feature-gate + embedder contracts must be regression-tested (Form Builder, Component Studio, Predictive Studio smoke) |
| **S6** | **Thread polish (T1/T2)** | Quiet meta line (`messageExtra` slot), memory capture moment w/ scope-at-capture, escalation card (ungrouped only), Companion Rail (rail slot from S0; run-driven in/out, cancel-run, rail-over-studio per corrected mockup) | Depends on S0's rail slot + S5's pane hoist. ⚖2 (plan-mode semantics) should be re-locked before the plan-card portion; card renders as-shipped until then |
| **S7** | **Mobile pass** | Breakpoint behaviors per the mockup's reuse-manifest column: sidebar drawer, Studio takeover w/ flip-back, run-strip, 1-col reflows | Derives from settled desktop slices; uses established Explorer mobile conventions |
| **S8** | **Cutover** | Swap `ChatConversationsResource` composition to mount `mj-composed-shell`; retire orphaned workspace + old sidebar composition + Part 3 deletions (incl. input deprecations); execute the **ledger CONTRACT checklist** (string couplings/rename map, overlay boundary + toast predicate, `<mj-toast>` hosting, omnibar nonce path, notification params incl. ⚖6 fix, Instance Config keys, routines event bridges); per-embedder smoke tests; runtime-verification list; full deterministic integration tier | Smallest diff, biggest checklist. AN-BC review. The old shell dies here and only here |

**Parallel track (own PRs to `next`, any time):** D-S9 read-status migration + CodeGen +
`NotificationService` localStorage replacement (owner: pending Amith answer — unblocks the S3/S4
excluded affordances as a later S3b/S4b top-up) · `Task.ProjectID` stamping · Artifact↔Project
relationship (audit §4) · dead-file deletions that don't touch the shell
(`dialog.service.ts.bak`, `ShareModalComponent`, etc.) can ride any slice.

## 2b. Slice-spec protocol (where the fine detail lives — deliberately NOT in this doc)

This plan stays at roadmap altitude on purpose: the behavioral detail lives in the mockup, the
coverage detail in the ledger, the code facts in BASELINE — restating them here would create a
fourth copy that drifts. Instead, **every slice starts with a one-page `slices/SLICE-Sn.md`,
written and reviewed BEFORE code**:

1. Ledger rows this slice discharges (MOCKUP) or carries (CONTRACT), by name
2. Mockup references: frames/states + the relevant `functional-mockup-src/` functions
3. Components/files to be created or touched (with the package boundary called out)
4. State model + persistence keys (UserInfoEngine keys named exactly)
5. Exclusions (what this slice deliberately does NOT do, with its §E / ⚖ / later-slice home)
6. Test plan (unit + any IT check) and the screenshot checklist for review
7. Anything needing a Matt design call, surfaced up front — not discovered mid-build

Matt reviews the spec (minutes, not hours), then the build runs against it. The spec becomes
the PR description skeleton. S0's spec is written at kickoff since it's next; later specs are
written just-in-time so they describe reality, not speculation.

## 3. Decision gates blocking specific work (from the ledger ⚖ list)

⚖1 nesting rules (Amith) → sidebar/W0b tree behaviors beyond the mockup's flat+dots ·
⚖2 plan-mode re-lock (Amith) → S6 plan card semantics · ⚖4 threads revive-or-delete → S8
deletion list · ⚖5 search↔omnibar → not in any slice; its own design session · ⚖6 notification
params → S8 (recommended: fix) · ⚖9 intent-check → S8 deletion list. None block S0–S2 start.

## 4. Risks & mitigations

1. **Integration-branch drift** (the known cost of the chosen branch model) → weekly `next`
   merges + drift check; schema never waits on the branch.
2. **S5 destabilizing chat-area for embedders** → contract tests + embedder smoke before merge
   into the integration branch; the gate inputs stay byte-compatible.
3. **P1.6 (Amith's memory/incognito lane) collides with S4's Memory tab / composer surfaces** →
   coordination point at S4 start; S4 renders existing note entities read-only-safe and takes
  P1.6's additions as a top-up.
4. **D-S9 owner unresolved** → S3/S4 ship without read-status affordances (already excluded in
   layout with slots reserved); no rework when it lands.
5. **Estimate flex** → slices are independently shippable into the integration branch; scope
   cuts happen per-slice, never by weakening S8's checklist.
