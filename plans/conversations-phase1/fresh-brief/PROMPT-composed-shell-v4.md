# Prompt — Composed Shell v4 (team-feedback refinement pass)

> Paste everything below the line into a Claude Design session, attaching the v3 canvas
> ("MJ Composed Shell v3") so it regenerates from its own prior work. Self-contained.

---

You produced "MJ Conversations — The Composed Shell v3 (correction pass)": 14 frames — F1 Front
Door · P1–P5 Project Room · T1–T3 Thread · W0a Chats · W0b Projects · W1 Tasks · W2 Collections ·
W3 Routines. That canvas passed team review: **the direction is confirmed — do not redesign the
composition.** This pass applies the team's structural decisions. Keep everything not listed
below exactly as it is in v3, including the FUTURE-tag treatment and all v3 corrections.

## Structural changes (ratified by team review)

1. **Rename "Outputs" to "Artifacts" everywhere.** The Room tab (P4), the P1 overview card
   header, and any copy that says "outputs". Reason on record: artifacts are both inputs and
   outputs of work, "Outputs" misdescribes them. Frame P4 relabels to "Room — Artifacts".

2. **Remove Tasks from top-level entirely.** Delete the W1 Tasks frame and remove "Tasks" from
   the sidebar nav (all frames). The task-graph system is agent-internal machinery, not a
   user-facing tasking product. Live-run visibility survives ONLY where it already lives:
   the Companion Rail while a run executes (T2), and Front Door's "Ran overnight" section.

3. **Room Workflows tab — propose its fate, labeled PROPOSAL.** With Tasks demoted, decide
   whether P5 survives as a reduced project-scoped tab or folds into the Overview's activity
   feed (a "runs" section under Since-you-left). Render whichever you recommend and mark the
   frame header with a PROPOSAL badge and one line of reasoning. Do not keep it out of inertia.

4. **Projects default visibility — CONTESTED. Render BOTH candidate first-run states as a
   side-by-side pair** so the team decides on pictures, not predictions. Two new frames:
   - **F0a · "Front Door — first run, projects hidden"** (Proposal A — default-OFF): sidebar
     with NO Projects section — just New conversation, Chats, Collections, Routines, Pinned,
     Recents, and the Settings gear. Front Door sections unchanged but with no project chips
     on the cards. The shell must visibly still work whole in this state.
   - **F0b · "Front Door — first run, projects visible"** (Proposal B — default-ON): identical
     shell, plus the Projects nav item and an EMPTY Projects state that teaches — a single
     quiet line under the nav item or in its landing: "Group related chats, memory, and
     deliverables · Create your first project." No badges, no demands, nothing else. The point
     of this frame: prove that visible-by-default IS the calm version.
   Give both frames the same fictional user and identical content otherwise, and add a one-line
   annotation under each stating its proposal. Do not editorialize a winner.

5. **The organic escalation moments — these are onboarding, valuable in BOTH models above:**
   - In **T1**, add an agent suggestion card after the reply: a quiet inline card — "This is
     shaping into ongoing work. Create a project from this chat?" with [Create project]
     [No thanks] — annotated: converting makes this conversation the project's first chat
     (and, under Proposal A, turns Projects on for this user).
   - On **F0a**, add a footnote annotation: being added to a project by a teammate also turns
     Projects on (the section appears in the sidebar with a one-time "new" cue).

6. **New frame S1 · "Conversations Settings"** — a slide-in panel opening from the sidebar gear:
   a Projects visibility toggle (label it neutrally — "Show Projects" — the default direction is
   the contested decision in item 4, so don't render a default state as settled), plus
   placeholder rows for the other app-level preferences the panel will host (keep it sparse and
   calm). This is a panel over the current surface, not a page.

7. **Read-status affordances** (schema endorsed, not yet built — FUTURE-tag each of these):
   - A "last read" divider line in the T1 thread (Slack-style "New" rule where the user left).
   - Unread state on W0a rows and sidebar conversation rows: bold title + quiet dot — still
     no counts, no badges.
   - Front Door "Ran overnight" gains a sub-line: "3 agent replies since you were last here".

8. **Sidebar in ALL frames**: remove Tasks; add the Settings gear at the nav's bottom edge.
   Frames other than F0 show the projects-ON sidebar as today (those users have projects on).

## Deliverable

The canvas re-rendered as v4: 16 frames (F0a, F0b, and S1 added, W1 removed, P5 replaced per
your item-3 proposal), plus a changelog listing each numbered item and the frames it touched.
Still NO states pass in this session — new/sparse/heavy/loading/error/read-only and dark theme
remain the next session, on top of v4.
