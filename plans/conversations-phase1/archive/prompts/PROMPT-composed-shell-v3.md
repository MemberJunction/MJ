# Prompt — Composed Shell v3 (correction pass)

> Paste everything below the line into a Claude Design session, attaching the v2 canvas
> ("MJ Composed Shell v2") so it can regenerate from its own prior work. Self-contained:
> no repo access assumed.

---

You produced "MJ Conversations — The Composed Shell (all screens)": 14 frames — F1 Front Door · P1–P5 Project Room (Overview / Conversations / Memory / Outputs / Workflows) · T1–T3 Thread (At Rest / Work Running / Artifact Open) · W0a Chats · W0b Projects · W1 Tasks · W2 Collections · W3 Routines.

**The composition is ratified and stays exactly as it is**: Front Door as the app-open landing; Project Room as what opening a project shows; the quiet meta line at rest with the Companion Rail as an earned state; Studio Split as the artifact-open state; user messages as filled bubbles with agent turns as flat avatar rows; the top-chrome ⌘K search and bell.

Your task is a **correction pass — v3 of the same canvas, same 14 frames, same layout**. An engineering audit checked every drawn affordance against the shipped system's actual mechanics and the project's ratified decision log. Apply every numbered item below exactly. Do not add new surfaces, do not redesign anything not listed, do not reopen settled decisions. Where an item says LABEL FUTURE, keep the element but mark it with a small, consistent "future" tag treatment — design that tag once and reuse it everywhere it applies.

## A. Redraw — these depict mechanics that do not exist (they would mislead)

1. **Memory review (F1 needs-you · P1 needs-you · P3 ledger).**
   - Remove "proposed org-wide" everywhere. Agents cannot propose org-wide notes; scope-widening happens only in a background consolidation process, never in-chat.
   - Remove the "awaiting review" held state from the P3 ledger. There is no approval hold — new notes are live immediately.
   - Keep the in-thread capture moment (T1 "Remembered: … Keep / Edit / Discard") but treat it as immediate-with-undo, not pre-approval.
   - Replace the F1/P1 "notes to review" rows with recency review: "2 new notes captured since you left · Review". The P3 ledger keeps edit/forget; the org-wide-forget confirmation stays.
2. **Plan approval (F1 · P1).** Remove "4 steps · est. $0.12". A plan is a single editable text document; nothing counts steps or estimates cost before a run. The card reads: "Plan awaiting approval — Dues reconciliation, chapter rollup · Review plan".
3. **Temporary chats (W0a · everywhere).** Remove the temporary-chat row from the Chats list and remove "auto-deletes in 29d" everywhere — temporary chats are hidden from all lists by locked decision, and no retention policy exists. Keep the Front Door composer's Temporary chip exactly as drawn (creation-time choice that locks at first send — correct).
4. **Routines vs projects (P1 · P5 · W1).** Remove routine runs from all project surfaces: "Weekly digest ran twice" leaves P1's Since-you-left; "Weekly membership digest · via routine" leaves P5's history; W1 stops grouping routine runs under a project. Routines are personal and project-agnostic; their runs do not belong to any project. W3 remains their home, and F1's "Ran overnight" section is fine (workspace scope).
5. **Collections (W2).** Every artifact card shows an exact version pin ("pinned to v3"). Remove "latest" — collections cannot follow a moving head today. If you want to show the follow-latest idea, do it on exactly one card with the FUTURE tag.
6. **Live and pre-run numbers.**
   - T2 rail, P5 live workflow, W1 live task: remove "$0.04 so far". No live cost stream exists. Show step names, elapsed time, and status only. Post-run cost in T1's meta line ("$0.04") is real — keep it.
   - T1 meta line: "Used 3 notes" → "Memory used · view" (the per-run count isn't recorded).
   - Composer hint: "Sage reads 3 project notes & 5 org notes" → "Sage reads project & org memory" (a count is unknowable before the message exists).
   - Progress bars (T2 · P5 · W1): completed steps may show measured widths; running and waiting steps render indeterminate — no invented future durations.
7. **Copy fixes.**
   - W3: "alerts only when count rises" → "alerts when the numbers change" (change detection is not directional).
   - W0b delete footnote → "Deleting a project moves its conversations to Ungrouped and permanently removes the project's memory; artifacts remain in Collections. Archive instead to keep everything." (Delete DOES delete project memory — the copy must be honest about exactly that.)

## B. Ratified-position fixes (the project's decision log)

8. **Remove all count badges.** Room tabs lose their numbers (Conversations 8 / Memory 12 / Outputs 6 → plain labels; the Workflows live dot may stay, the number goes). Sidebar "Projects 12" loses the 12. W0b project cards lose the stat-chip footers — keep at most the live dot and member avatars as qualitative signals. Ratified rule: no counts, no badges; activity is a quiet dot. Also replace W0b's "2 nested" chip with a subtle nested-tree glyph (nesting semantics are pending ratification; don't pre-render them as a count).
9. **Composer placeholder**: "@ agents · # records · / skills" → "@ agents & people · # records · / skills". @ has two verbs — Send-to (agents; reroutes the message) and Reference (people; adds context) — and the picker distinguishes them.
10. **Memory is agent-plural.** P1's memory card rows and P3's ledger gain an Agent chip/column: "All agents" or a specific agent name, shown alongside the Project/Org-wide scope chip. The existing Source column stays (capture provenance) — attribution and provenance are different things.
11. **Sidebar parity.** Restore three shipped behaviors the composed sidebar dropped: a Pinned section (above Recent Projects), the live filter box, and one-line description previews under conversation titles.
12. **Failures are visible on the hub.** P1's needs-you includes the failed workflow ("Sponsor CRM sync — failed at step 3 · Retry"), matching the ratified rule that nothing fails silently behind a tab.

## C. Keep, but LABEL FUTURE

13. Project members header, "Dana joined as editor", and Share-with-roles on the Room (ratified direction; backing model is being designed).
14. W0b Archived tab + restore.
15. T3 footer "Remix" and "Analyze".
16. Composer context ring.
17. P1 "last here 4 days ago".
18. W3 "notifies push + email" → either change to "notifies in-app + email" (real today) or keep push with the FUTURE tag.
19. P4 "Drag an artifact here from any chat to file it" — keep the concept, FUTURE tag (no artifact-to-project filing exists yet).

## Deliverable

The same canvas re-rendered as v3 with all corrections applied, plus a short changelog listing each numbered item and the frame(s) it touched. Do NOT do the states pass in this session — new/sparse/heavy/loading/error/read-only and dark theme come next, on top of the corrected v3.
