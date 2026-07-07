# Conversations Phase 1 — Execution Plan (rev. 2026-07-07, post-review)

> Owner: Matt (UX lead; building with Claude; teammates review PRs). WBS: [conversations-phase1-plan.md](conversations-phase1-plan.md).
> This revision follows a full three-track review (routines · plan-mode/skills UI · remaining-areas sweep)
> of what the team shipped in parallel, 2026-07-01 → 07-06.

## 1. Shipped — with UX-drift assessment (Matt's review queue)

| Area | Shipped (PRs) | Matches design spec | **Drifts from design spec** |
|---|---|---|---|
| **Plan Mode** | #2996 (framework) · #3009 (UI + preference) · #3017 (governance: `RequirePlanMode`, `AIAgentRun.PlanMode`) | default-off ✓ · editable plan before approval ✓ · reject→re-plan ✓ · HITL via `AIAgentRequest` ✓ | Toggle is a **composer-toolbar icon**, not on the agent pill · **sticky per-conversation** (User Settings `mj.conversations.planMode.v2`), not per-request (approve auto-disables — hybrid semantics vs. D5) · plan is **one editable Markdown blob** (generic `mj-dynamic-form`), not discrete reorderable steps · **no execution progress** in the card (per-step split is a documented server override point in `buildPlanApprovalForm`) |
| **Skills** | #2996 · #3009 (`/skill` composer invocation, permission-filtered) · #3017 (+run-step observability) · #3029 · seeds #3013/#3015 | `/skill` chips w/ icon+color ✓ · unaccepted-skill warning toast ✓ · **activation timeline shipped and richer than spec** — run-detail **Skills tab** with per-invocation provenance-of-authority cards (`AIAgentRunStep.Skills` JSON) ✓ · SKILL.md import/export + sharing panel ✓ | **No catalog/browse UI** (generated entity forms only) · **no AcceptsSkills control on the custom agent form** (generated form only) · no agent-pill skills popover |
| **User Routines** | #3035 end-to-end (+follow-ups: per-routine hidden Conversations, notifications makeover, pluggable composer triggers) | Went through **its own design gate** (`plans/user-routines/design-brief.md` + 3 mockups; Amith locked "Option B — Command Center" 07-02) · friendly cron builder + plain-English preview ✓ · sidebar section (gated `ShowRoutines` + CanRead) ✓ · Explorer app ✓ · history→conversation ✓ · OnChange runtime ✓ | **No "turn this message into a routine"** entry (only blank "+" create) · **no context prefill** into the builder · **no Upcoming/agenda view** (`list \| editor \| history` only) · **no alerts/OnChange feed surface** (runtime fires, no UI home) |
| **Artifacts (partial)** | share-modal with **public link** (`isPublicLink`) + magic-link server infra | public-link mechanism ✓ | **No publish privilege gate** — "Can Publish Artifacts Publicly" is not seeded (only a comment in the mega migration); no version-editing; no remix |

**Matt's action on this table:** walk the four shipped areas in the product against the design intent and
disposition each drift: *accept* (update spec), *iterate* (file a parcel), or *escalate* (design decision).
The plan-mode semantics (sticky vs per-request, blob vs steps) and the routines chat-entry gap are the two
with real UX stakes.

## 2. Genuinely open — remaining parcels (verified absent)

| Parcel | Scope | Notes |
|---|---|---|
| **D′ — Residual schema** | `ConversationParticipant`, `Conversation.IsTemporary`/`IsGroup`, `AIAgentNote`/`AIAgentExample.ProjectID`, seed "Can Publish Artifacts Publicly" (+ naming from the call) — these exist **only** in the unmerged mega migration | **Also: the mega migration on PR #2953 now collides with merged #2996 AND #3035** — it will fail Flyway; must be removed/pruned before #2953 can ever merge |
| **C — Context gauge** | `computeConversationUsage()` + header chip + pref + ~85% nudge | Zero trace in repo. ⚠ overlaps open plan PR #2732 (context compaction) — align, don't collide |
| **R+ — Routines UX completion** | turn-message-into-routine (+prefill `@Input` on the slide-in), Upcoming/agenda view, alerts feed home | *New parcel from the drift review; the pluggable composer-trigger contract (#3035 follow-up) is the natural seam for the message entry* |
| **B′ — Skills admin surface** | catalog/browse UI · AcceptsSkills (+`SkillActivationMode`, `RequirePlanMode`) controls on the custom agent form | Small; mostly form panels |
| **E — Memory UX + incognito** | `projectId` wiring in agent-context-injector/MemoryWriteManager (zero hits today) · memory chips + panel in widget · `IsTemporary` behavior | Blocked by D′ + CodeGen. ⚠ overlaps open plan PR #3046 (Memora-inspired memory) — coordinate with AN-BC first |
| **G — Artifacts completion** | version editing (edit→new version) · gate publish behind the seeded privilege · remix | Public link exists; this is the remaining 60% |
| **H — Polish bundle** | quote/multi-quote · fork · keyboard service + `?` cheat-sheet · jump-to TOC | ⚠ #3042 (open) is a Ctrl+K omnibar — the palette/shortcut layer may be landing there; align before building |
| **I — Design-only docs** | proxy ADR (P1.9) · concurrency ADR (P1.0.3) · group-chat P2 spec (P1.8.4) | No proxy/group code exists anywhere — confirmed clean |

## 3. Revised sequence

1. **Drift review (Matt, days 1–2):** walk plan-mode, `/skill`, routines, artifact-share in the product;
   disposition the drift table above. This replaces the old "mockup gate" — the gate now applies to
   *shipped* UX. Output: accepted-as-is list + iteration parcels.
2. **Coordination (Matt, day 1, same call):** AN-BC owns the active `agent-skills-plan-mode` branch and the
   open memory/context/omnibar plan PRs (#3046, #2732, #3042). Agree lanes: proposed split — AN-BC keeps
   memory internals + omnibar; Matt+Claude take **C (gauge), R+ (routines UX), B′ (skills admin), G (artifacts), D′ (schema)**.
3. **D′ residual migration** + kill the mega migration on #2953 (unblocks E/G privilege seed; removes the Flyway landmine).
4. **C — gauge**, then **R+ — routines UX completion** (highest user-visible value per effort).
5. **B′ — skills admin**, **G — artifacts completion**.
6. **E — memory UX** only after the #3046 conversation settles the architecture.
7. **H — polish** after #3042 lands (build on the omnibar, don't duplicate it). **I — docs** anytime.

## 4. Standing rules & risks (unchanged from prior rev)
One parcel = one branch off latest `next` = one PR linking its spec; build + Vitest + `check:ui` + browser
walk (light/dark) before ready; Matt approves every commit/push. Top risk remains **parallel-work collision**
— re-verify against `next` the morning any parcel starts; second risk is drift-review decisions reopening
shipped UX (timebox the disposition; prefer follow-up parcels over rework).
