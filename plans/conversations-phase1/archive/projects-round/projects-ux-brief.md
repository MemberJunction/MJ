# Projects UX — Design Brief

**Initiative:** Folders → **Projects**: promote `MJ: Projects` from a sidebar grouping ("Folders")
to MJ's first-class workspace container — conversations, agent memory, tasks/workflows, artifacts,
and sharing, all scoped per project.

**Status:** Brief derived from the 2026-07-07 Projects discussion (see §P1.6 revision + D17–D20 in
`conversations-phase1-plan.md` and the Teams summary note). Mockups: `mockups/projects.html`
(three divergent options, per the P1.0.1 convention). This is **bigger than P1.6** — P1.6 ships
project-scoped memory + incognito now; this brief covers the full Projects presentation for the
"Projects v1" sub-phase.

**✅ DIRECTION PICKED (2026-07-07): Option A — Project Hub.** Amith: "Option A is really the best
way to group this all together." One correction folded into the mockup: memory is **agent-plural**
— it's "what *agents* remember here," not "what Sage remembers": notes can be shared across all
agents or scoped to one (`AIAgentNote.AgentID` nullable), and the hub's memory card now shows
per-note agent attribution (All agents / <agent>) alongside Project/Global scope. Options B and C
remain as reference; C's companion panel is the natural later complement to the hub.

## Persona

- **Primary:** business users who live in MJ Conversations daily, working with agents (Sage et al.)
  across several parallel initiatives. Non- to semi-technical. They think in *initiatives*, not folders.
- **Secondary:** analysts / power users who run multi-step agent workflows (task graphs) and need to
  find the outputs later; admins who govern who sees what.

## Job to be done

> "Keep everything about one initiative — my chats, what my agents have learned about it, the
> workflows they're running, and the documents they produce — in one named place I can open,
> understand at a glance, share with my team, and come back to next month."

## Current pain

- "Folders" are just a sidebar grouping — a project isn't a *place* you can open or understand.
- Agent memory is invisible and global; nothing is scoped to the initiative (P1.6 fixes the scoping;
  the UX must surface it).
- Sage already builds real task graphs (`MJ: Tasks` + dependencies + Gantt viewer) — but they land in
  no container; users can't see "what's running in this project."
- Artifacts live in a separate Collections tree, disconnected from the initiative.
- No sharing boundary — sharing means sharing N individual things.
- The word "Folders" undersells the machinery that already exists (and the market idiom is
  "Projects" — ChatGPT and Claude both use it).

## Success criteria (what "outstanding" means)

1. A project is **open-able** — a coherent presentation, not merely a filter on a list.
2. **At-a-glance state**: recent activity, running workflows, latest artifacts, and what agents
   remember (shared across agents or per-agent) — within one screen of opening a project.
3. **Zero-friction organization** preserved: drag-drop move, nesting, create-in-place (nothing the
   June folders feature does gets harder).
4. **Memory transparency & control** per project (view / edit / delete; global vs project scope
   legible), incognito clearly distinct.
5. **Sharing comprehensible in 5 seconds**: who's in, what they can do, one affordance to change it.
6. Parity-or-better vs ChatGPT/Claude Projects — while showing what only MJ can do (agents, task
   graphs, governed data, versioned artifacts).
7. Everything in the existing ng-conversations design language (tokens, chrome, idioms) — the
   mockups should read as the same product.

## Constraints

- ng-conversations anatomy is the baseline: left sidebar (~280px; pinned/folders/ungrouped
  sections, routines section), chat area, right artifact panel, bottom composer.
- `--mj-*` semantic tokens only; light + dark.
- Entity model is fixed: `Project` (nestable, color/icon, environment-scoped),
  `Conversation.ProjectID`, `Task.ProjectID` (unused today — to be stamped by TaskOrchestrator),
  planned `AIAgentNote/AIAgentExample/AIAgentRun.ProjectID` (P1.6/D17), `Collection` for artifact
  taxonomy, `AccessControlRule`/`PublicLink` for sharing.
- Mockups only at this stage; user reviews in his own browser (no screenshots, no auto-open).

## Non-goals

- Group-chat runtime (P1.8 metadata / Phase 2), presence, typing.
- bizapps-tasks integration (separate app, separate schema — deliberately).
- Model pickers or provider UX (locked non-goal for the platform).
- Building production code now — the mockup pick gates the build.

## The three divergent philosophies (mockups/projects.html)

| Option | Thesis | Metaphor |
|---|---|---|
| **A — Project Hub** | A project is a **place you open**: a landing page with overview, memory, workflows, artifacts, members as one destination | Notion/Linear project page |
| **B — Project as Workspace** | A project is a **context you work inside**: a far-left project rail switches the *entire* workspace lens; everything is scoped to the active project | Slack workspaces / Discord servers |
| **C — Companion Canvas** | The **chat stays the hero**; project context (memory, workflow, artifacts) rides alongside every conversation in a live right-hand companion panel | Claude Projects knowledge panel, evolved |

Each option must cover end-to-end: the rename (sidebar says **Projects**), create/nest/move, opening
or entering a project per its philosophy, memory view+manage, task-graph rollup, artifacts, sharing,
and the temporary-chat (incognito) distinction.
