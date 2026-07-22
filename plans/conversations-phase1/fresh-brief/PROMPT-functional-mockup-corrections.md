# PROMPT — Functional Mockup, Correction Pass · 2026-07-22

> Session type: **correction pass** on "MJ Composed Shell - Functional Mockup.html" (the
> reviewed artifact). The full review PASSED: architecture is a true extension, all locked
> layout/naming/idiom constraints verified in code AND in a live browser walk, zero JS errors.
> This pass fixes the enumerated items below — nothing else. Do not redesign, do not add
> surfaces, do not re-litigate. Deliver the updated artifact under the SAME filename/format.
>
> Ratified since the build: **⚖11 — NO FUTURE tags, the mockup is the target-state design of
> record.** Your build's untagged rendering was correct. Consequence: formerly-FUTURE features
> are intended product and belong IN the mockup untagged; the backed-vs-unbacked tracking lives
> in CONTINUITY-LEDGER §E, not the UI.

## Attach with this prompt
`FUNCTIONAL-MOCKUP-SCOPE.md` (updated exit criteria) · `CONTINUITY-LEDGER.md` (⚖ resolutions
+ §E) · `SHELL-DECISIONS.md` · `CLAUDE-DESIGN-HANDOFF.md` (context block verbatim) · the
current mockup HTML.

## Fixes (numbered; do all)

1. **Add "Analyze" — it is a REAL shipped feature, not future.** Artifact pane Options menu
   gains "Analyze — start an analysis conversation from this artifact's data snapshot"; action
   opens a NEW conversation seeded with the artifact as input (mirror the shipped
   `AnalyzeArtifactService` flow). Remix stays exactly as built (correct under ⚖11).
2. **Rail × Studio Split: cancel-run must stay reachable.** Current behavior (studio suppresses
   rail AND run-strip) leaves a live run unfollowable/uncancellable while an artifact is open.
   Fix: the "Working now" strip renders above/inside the chat control strip while studio is
   open; tapping it opens the rail OVER the studio (or swaps to it); Cancel run reachable from
   the strip's expansion. Collapse behavior unchanged when the run finishes.
3. **Read-status affordances complete and reachable** (design-of-record per ⚖11): the "New"
   last-read divider must be demonstrably triggerable (state-map jump), unread quiet dots on
   sidebar/W0a/Front Door rows, "since you were last here" line on Room Overview. No tags.
4. **Follows-latest collection pin** (W2): add the pin-mode indicator on collection artifact
   cards ("v3 · pinned" vs "follows latest") — design-of-record, untagged.
5. **Deliverables debt — the artifact must carry its own paperwork:**
   a. Dated **changelog block** (this pass + retroactive one-liners for the initial build's
      session groupings), accessible from the state-map panel.
   b. **REUSE MANIFEST** — cumulative table (region → MOCKUP-SPEC | MOUNT-POINT w/ shipped
      component name → breakpoint behavior), embedded as a panel or companion section.
   c. **PLACEMENT ACCOUNTS** per surface (at-rest / hover / overflow / consolidated /
      deleted-on-record), embedded or companion.
   d. **State map fully re-keyed** to the F/P/T/W taxonomy: resolve the P1–P3 double-booking
      (personas vs Room tabs — rename personas to PA1–PA3), fix stale labels ("W0a thin cut",
      "W2 stub" — W2 is full), rename the `tab-workflows` jump to `room-runs`, and update the
      "7-tab viewer" label to match the rendered tab set.
6. **Logo mark gradient → flat brand color** (`.mj-mark`): flat-colors rule; the original app's
   mark was flat.
7. **Show Projects toggle must not close the Settings panel** on flip — re-render with the
   panel open so the user sees the sidebar change behind it.
8. **Remove the two vestigial `<link rel="preconnect">` tags** (fonts are fully embedded;
   the artifact must reference zero external hosts).
9. **Tab-set note (ratified at review):** the artifact pane's 8-tab component set
   (Display/Functional/Technical/Data/Code/Spec/Details/Links) and 4-tab non-component set
   are ACCEPTED as the shipped metadata-driven shape — no change; just fix the "7-tab" labels
   (item 5d).

## Definition of done for this pass
Every numbered item done; browser-walk clean (no JS errors); dark mode unaffected; the three
paperwork deliverables (5a–c) present; no other visual or behavioral diffs beyond the items
above. Stop after delivering — Matt reviews before anything further.
