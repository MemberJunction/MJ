# Composed Shell v2 — Implementation-Soundness Audit

> Date: 2026-07-15. Canvas: `hub-prototype/MJ Composed Shellv2.html` (14 frames).
> Method: four parallel cross-reference audits — (1) placement account vs FUNCTIONAL-CONTENTS.md,
> (2) plan conformance vs conversations-phase1-plan.md / EXECUTION / ATLAS / projects-ux-brief /
> runtime-extraction, (3) ratified-position + parity conformance vs the hub-prototype doc set,
> (4) implementability vs the system guides (memory, skills/plan-mode, routines, permissions,
> conversations stack, realtime) with schema verification.
>
> **Verdict: the shell composition is sound — all four locked SHELL-DECISIONS render correctly,
> no one-way door is broken, and ~80% of what's drawn has shipped backing (often startlingly
> close: artifact lenses, version pins, run-now = NextRunAt=now).** But the canvas is NOT yet
> the design of record. It contains 8 contradictions of locked decisions or actual subsystem
> mechanics, ~12 silent proposals needing ratify-or-strike, 6 clusters of shipped machinery with
> no home, and 6 backend prerequisites nobody has scheduled.
>
> Placement account: **31 addressed / 29 partial / 24 gaps of 84** FUNCTIONAL-CONTENTS items.
> Prior gaplist: ~5 closed, 4 partial, 15 open of 23.

---

## 1. Contradictions — fix in the canvas (or re-ratify) before it becomes design of record

| # | Finding | Contradicts | Severity |
|---|---|---|---|
| 1.1 | **Memory "awaiting review" gate + "proposed org-wide" are false as drawn.** No human review gate exists: provisional notes inject immediately and the Memory Manager auto-hardens them ~every 15 min. And agents CANNOT propose org-wide notes — the in-flight write guard clamps scope to ≤ Agent+User; scope-widening is exclusively the MM's judgment. Keep/Edit/Discard is honest only as the T1 capture-moment and post-hoc ledger actions (reinforce/edit/archive). Implementing the drawn semantics = new framework lifecycle machinery. | AGENT_MEMORY_GUIDE §1, §3, §4 | **BLOCKER** |
| 1.2 | **"Plan awaiting approval — 4 steps · est. $0.12".** Plans are one free-text Markdown blob on `MJ: AI Agent Requests`; nothing structures steps, and NO subsystem estimates cost pre-execution (cost is post-hoc on prompt/agent runs). Descope card to "Plan awaiting approval → Review plan". | SKILLS_AND_PLAN_MODE §2.3; EXECUTION drift row 1 | **BLOCKER** |
| 1.3 | **Temporary chat listed in W0a Chats** ("Ungrouped · temporary · auto-deletes in 29d"). Locked D7 = persisted-but-**hidden** (`IsTemporary=0` filtering is P1.6.5, being built NOW). The 29-day retention is invented — no TTL columns, no sweeper, and memory read/write suppression has no per-request param today. | Plan §0.3 D7, P1.6.5; schema verified | MAJOR |
| 1.4 | **Routine runs claimed by the project Room** (P1 "Weekly digest ran twice", P5 history "via routine") while W3 itself says "project-agnostic in v1". `UserRoutine` has no ProjectID; runs land in a hidden Application-scoped conversation. Pick one: ratify routine→project scoping (new decision + column) or strip routine rows from Room surfaces. | Plan §P1.5; boundary 3 (DESIGN-NOTES) | MAJOR |
| 1.5 | **Per-note agent attribution dropped.** The picked hub direction (Amith-ratified) includes "All agents / \<agent\>" attribution alongside scope on the memory card; P1's card shows scope only, P3's Source column is capture provenance, not `AgentID` scoping. | projects-ux-brief "DIRECTION PICKED" | MAJOR |
| 1.6 | **Count badges on Room tabs** (Conversations 8 · Memory 12 · Outputs 6), sidebar "Projects 12", W0b card stat-chip footers. The handoff hard-bans reintroducing tab count badges / stat lines; position 9 ratifies "no counts, no badges". | CLAUDE-DESIGN-HANDOFF:56-58; position 9 | MAJOR |
| 1.7 | **W0b delete copy "nothing is deleted"** — position 7 ratifies that project delete DOES delete project memory (conversations move out, artifacts survive in collections). The honesty matters precisely there. | DESIGN-NOTES position 7 | MAJOR |
| 1.8 | **W2 "latest" collection membership is unrepresentable.** `CollectionArtifact.ArtifactVersionID` is NOT NULL + UNIQUE — membership is always an exact version pin. "Pinned to v3" is real; "latest" needs an additive schema change (nullable version / follow-latest flag) or the cards flip to pins. | Schema verified | MAJOR |
| 1.9 | Composer placeholder "@ agents" collapses position 5's two verbs (@ = agents to Send-to AND people to Reference). | DESIGN-NOTES position 5 | MINOR |
| 1.10 | Context ring: always-on, in the composer. P1.1 spec = header slot, opt-in default-false. Re-decide consciously if the first-party shell differs. Also: no client-side context telemetry exists yet. | Plan §P1.1.2-3 | MINOR |
| 1.11 | Routine copy "alerts only when count rises" — OnChange is a result-hash diff, any change both directions. Say "alerts when the numbers change" or put directionality in the agent. | USER_ROUTINES §3 | MINOR |

## 2. Silent proposals — ratify or strike (each needs one line of recorded intent)

1. **Artifact drag-to-file into project Outputs** (P4) — draws boundary-1's reserved "add existing artifact to project"; ALSO a data-model gap (no Artifact↔Project relationship exists or is planned). Gaplist 1.13 wants the harvest kept; ratify + schedule schema, or strike the hint.
2. **Project archive** (W0b Active/Archived + restorable copy) — in no plan doc; no schema field. (Position 7 ratifies archive for the *removal flow*; a browsable Archived surface is new.)
3. **Collection version-pinning indicators** ("pinned to v3") — boundary 1 said NOT drawn. Real per schema, but ratify the surfacing.
4. **Nesting chip** ("2 nested", W0b) — nesting is deliberately undrawn until the six hierarchy questions ratify; already an Amith agenda item.
5. **Temp-chat 29-day retention** — see 1.3; needs a product decision + purge job if kept.
6. **Manual "Add note" to project memory** (P3) — brief committed view/edit/delete; user-*authored* notes are new (fine, but on the record).
7. **"Analyze" artifact action** (T3) — in no doc.
8. **Collections "share cascades"** (W2 subtitle) — cascade semantics undocumented; collection sharing has a known open server bug.
9. **Pre-send memory disclosure** ("Sage reads 3 project notes & 5 org notes") — a third memory surface beyond the agreed pair; also unknowable pre-send under the `Relevant` strategy (retrieval is semantic vs the not-yet-typed input). Reword strategy-independent or drop.
10. **"Last here 4 days ago"** — per-user project-visit tracking; no mechanism (could be a UserInfoEngine setting — decide).
11. **"Plan first" chip semantics** — reads per-request; seam #5 (per-request vs shipped sticky-per-conversation) is still open. The chip is fine; label the seam resolved or keep it open consciously.
12. **"Born here, curated anywhere"** (P4) — silently answers the open projects↔collections question with the working theory. Good answer; write the one line of ratified intent.

## 3. Shipped capability with no home (parity risk — needs an address or a conscious-regression entry)

1. **Global search — CORRECTED 2026-07-15.** The shared top-chrome bar on every frame DOES carry a Search field with ⌘K badge and a notifications bell (the audit agents read the frame-body scripts and missed the chrome wrapper). With #3042's omnibar merged, the global entry is covered. What still stands: the composed sidebar drops the shipped live filter, description previews, and Pinned section (all of which the hub prototype had already implemented), per-row notification badges are absent, and the search panel's project-scope behavior (seam #7) is an omnibar-provider task.
2. **Voice/realtime — entire stack.** One mic icon; nothing else. Shipped: session overlay, channel surfaces (whiteboard/remote browser), delegation cards, transcript persistence, session card w/ recording + resume. The thread needs a fourth state (in-call) alongside rest/rail/split, incl. how in-call collides with Studio Split; plus the collapsed session card in-thread.
3. **The plan-approval card itself + the rejection loop.** Three frames point at "Review plan"; the card (editable markdown, approve / reject-with-reason) is drawn nowhere, and rejection→re-plan→pause-again (which the runtime enforces) has no state. Cross-user approval semantics (approvals surfacing for shared conversations) undesigned.
4. **Message-row machinery**: hover actions (pin · inline edit + "(edited)" · delete-below · retry), rating flow, image/attachment rendering + viewer, submitted-form pills, export. All shipped [S] items.
5. **Skill activation visibility.** `/ skills` in the composer but no after-the-fact surface. Runtime records `StepType='Skill'` + per-step provenance, auto-activations warrant a warning accent (agent widened its own surface). Meta line needs a skill chip; Inspect-run inherits detail.
6. **Chat overlay mode, threads panel, notification badges, @-config-preset chips, response-mode preset catalog** (the "Standard" chip implies Draft/Standard/High — no catalog, no storage column, though `effortLevel` gives raw material). Each needs a home or an explicit deletion proposal (threads = seam #6).

## 4. Backend prerequisites (schedule these or the drawn UI is empty)

| Item | Backs | Size guess |
|---|---|---|
| `Task.ProjectID` stamping in TaskOrchestrator | W1 group-by-project, P5 Workflows tab, W0b "1 live" chips | Small, known (seam #3) |
| Injected-notes read-provenance on runs (analog of `AIAgentRunStep.Skills`) | **Locked D-S1's** "Used 3 notes" meta line — currently unqueryable | Medium; framework |
| Project membership + Projects permission domain (table + provider + domain row per UNIFIED_PERMISSIONS §4 recipe) | Room member header, roles, project-scoped sharing (D-S4's one-way door — Amith) | Medium-large; design first |
| Temp-chat flag/TTL + `suppressMemory` param threaded client→resolver→BaseAgent (planMode-shaped chain) | Temporary chats as ratified | Medium |
| Streamed cost telemetry in progress callbacks (or downgrade UI to post-run cost) | T2 "$0.04 so far", live workflow cost | Medium; or free by descoping |
| Artifact↔Project relationship (column or junction) | P4 drag-to-file (if ratified) | Small-medium |
| Collection follow-latest membership (nullable version pin) | W2 "latest" cards (if ratified) | Small |
| Response-mode preset catalog + per-conversation storage | "Sage · Standard" chip | Small |
| "Remix" fork-artifact-to-new-conversation capability | T3/P4 Remix action | Medium |

## 5. Architecture fit (how to build it without forking)

The thread states assemble on the existing 3-layer conversations stack: `header` slot (crumb bar), `messageExtra` (quiet meta line, memory capture moment, command chips), `messageRenderer` if flat-row styling diverges from default, `demonstrationSurface` for Studio Split (it already does "stage takes main pane, messages → side rail"), `--mj-chat-*` tokens, Before/After events for gating. Front Door, Project Room, and the W-surfaces are new host-app surfaces OUTSIDE the widget (correct), consuming ConversationEngine / UserRoutineEngine / TaskResolver / PermissionEngine directly.

**Two missing extension points — file as ng-conversations widget issues rather than forking:**
1. **Composer slot** — agent chip, Plan-first chip, Temporary chip, context ring all live inside `message-input.component`, which has no projection surface today.
2. **Rail slot** — the Companion Rail is host-level side-panel chrome fed by runtime streaming/active-task state; no sanctioned side-panel slot exists on chat-area.

## 6. Meta-gaps (acknowledged, not itemized)

Happy-state, light-theme, desktop-only. The BRIEF's own bar (tenets 2/4/5/6) still requires: the states pass (new/sparse/heavy/loading/error/read-only), dark theme, mobile collapse, and a per-surface placement account. The next Claude Design session should do the states pass on THIS canvas as its single deliverable, with this audit + SHELL-DECISIONS + DESIGN-NOTES in its input package (the bubble relapse proved what happens otherwise).

## 7. Reconciliation with in-flight work (PR #2953 umbrella + open lanes) — added 2026-07-15

PR **#2953** (AN-BC) is the Phase-1 umbrella tracker: P1.3/P1.4 (plan mode + skills) and P1.5
(routines) SHIPPED via carve-outs; **P1.6 (project memory + incognito) is NEXT UP** with proposed
decisions **D17–D20 pending ratification at build start**; P1.1/P1.2/P1.7/P1.8/P1.9 designed but
not started. Projects direction: three mockup options, **Amith's initial lean = Option A "Project
Hub"** — settled after team review; "Projects v1" becomes a sub-phase sequenced AFTER P1.6.

**What this changes about the findings above:**

1. **§3.1 search is largely SOLVED upstream.** #3042 (unified Ctrl+K omnibar on a pluggable
   `OmnibarProvider` registry) is **MERGED**. The canvas fix shrinks to: draw the omnibar entry
   affordance (⌘K hint / search icon) in the shell chrome + contribute a project-scope provider
   (which also resolves seam #7). The dropped sidebar filter/pinned/previews items stand.
2. **§5's "missing composer slot" may be stale.** P1.5 shipped the extracted
   **`@memberjunction/ng-composer`** with pluggable trigger providers. Verify whether the agent /
   Plan-first / Temporary chips and context ring land as composer plugins before filing a widget
   extension issue. The rail slot gap stands.
3. **§1.3 incognito findings are TIME-SENSITIVE, in a good way.** D17–D20 (first-class `ProjectID`
   columns incl. `AIAgentRun`, server-derived `projectId`/`temporary`, creation-time incognito)
   ratify at P1.6 build start — i.e., imminently. The canvas's W0a temp-chat listing + 29-day
   retention conflict with D7's persisted-but-hidden must be resolved INTO that ratification,
   not after it. The canvas's creation-time chip that locks at first send matches D20 exactly.
4. **§1.5 (agent attribution) is Amith's own framing.** The umbrella PR body specifies memory as
   agent-plural ("what *agents* remember here", `AIAgentNote.AgentID` nullable). The canvas
   dropping it contradicts the umbrella directly — raise priority.
5. **§4 Task.ProjectID stamping is already on the umbrella's radar** (PR body: "exists but is
   never stamped today") as part of the Projects promotion — sequenced under Projects v1, no
   new project needed, but the canvas's Workflows surfaces stay empty until it lands.
6. **§4 project membership has a designated substrate**: the umbrella names the dormant v2.101
   ACL infra as the sharing basis for Projects. Still a design task (cascade semantics), but not
   a green-field one.
7. **D-S4 (Project Room) aligns with Amith's lean** (Option A Project Hub). Encouraging, but the
   umbrella says direction settles "after team review" — so D-S2/D-S4 remain *our* locks pending
   that review; they are not yet the umbrella's.

**Collisions to watch (other open lanes):** #3136 (live-streamed loop-agent replies — affects
thread streaming states), #2732 (conversation compaction — interacts with the context gauge),
#3046 (Memora memory-enhancement plan — the §1.1 review-gate machinery, if pursued, belongs in
that lane's design, not ad hoc), #3111 (GPT-Live realtime readiness — the voice-surface gap in
§3.2 should be designed against that plan, not the current overlay alone).

**Coordination moves (process, not design):**
- The canvas, SHELL-DECISIONS.md, and this audit should be attached to **#2953** as design assets
  (the same way projects-ux-brief.md + mockups/ are carried there), so the P1.0.1 mockup-pick gate
  and the team review consume them. A branch-local decision log that diverges from the umbrella's
  D1–D20 would recreate the exact churn this effort was built to end.
- SHELL-DECISIONS entries should cross-reference umbrella decision IDs where they overlap
  (D-S4 ↔ Projects direction; the temp-chat items ↔ D7/D20) and be re-marked "ratified" only
  when the umbrella review confirms them.
- The canvas is not one build. It decomposes onto the umbrella's sub-phases:
  P1.6 → P3 Memory ledger + incognito affordances (urgent, next up) · Projects v1 → P1–P5 Room +
  W0b + membership · P1.1/P1.2 → thread polish, context gauge, meta line · P1.7 → T3 artifact
  viewer/publish gate · P1.8 → Room member roster · realtime lane → the in-call thread state.
  **Front Door (F1) + Chats (W0a) have no owning sub-phase — propose one on the umbrella.**

## 8. What's confirmed sound (don't relitigate)

D-S1/D-S2/D-S3/D-S4 all render as locked, including the rejection of "projects are the front door". Bubbles-for-user / avatar-rows-for-agent matches the reversed position 13. Temporary chip only at the new-chat mint point (position 11). Memory tab scope model + org-wide forget warning (position 10). Archive-default for removal (position 7, modulo the copy fix). Failed-workflow-visible-with-Retry (position 8, though only on the Workflows tab). Honest Skip delegation (no fake steps for remote runs). Post-run cost in the meta line, artifact versions/lenses, collection pins, run-now/pause routines, task graphs with real dependencies — all schema-backed as drawn.
