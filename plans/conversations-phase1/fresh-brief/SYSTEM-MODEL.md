# System Model — Concepts, Hierarchy, Flows

> Document 2 of 3. The mental model the design must express. Two kinds of things exist:
> **containers** (things that hold other things) and **actors** (things that operate on
> the containers but live in none of them). Items marked **OPEN** are undecided seams —
> the design may propose answers, labeled as proposals.

## 1. Containers — what lives inside what

```
Workspace (everything a signed-in user sees)
│
├── Projects  — the organizing container; nestable; user-named, color + icon
│   │            OPEN: nesting semantics (roll-up, inheritance, move rules) are
│   │            undecided, but nested trees are shipped behavior — flat-only is a regression
│   │
│   ├── Conversations — a chat with agents; each has a pinned default agent,
│   │   │               a response-mode preset, and a plan-mode preference
│   │   ├── Messages        — flat avatar rows for BOTH parties (user and agent);
│   │   │                     agent turns carry generation time and are inspectable
│   │   ├── Agent runs      — one per agent turn: steps, tokens, cost, status ("the invoice")
│   │   ├── Attachments     — files/images on messages
│   │   ├── Artifacts       — versioned deliverables BORN here (see §3)
│   │   ├── Voice sessions  — a live call inside this conversation (see flow F5)
│   │   └── Threads         — reply-to-a-message side rail (OPEN: revive or delete;
│   │                         shipped but its entry point is orphaned)
│   │
│   ├── Project memory — notes agents keep for THIS project only (see flow F4)
│   └── Task graphs    — multi-step agent workflows for this project's work
│                        OPEN: tasks are not stamped with their project today; they
│                        currently land in no container — the design should assume they belong here
│
├── Ungrouped conversations — chats in no project (the default for quick questions)
├── Temporary chats — outside everything: read NO memory, write NO memory, join no
│                     project; a creation-time choice that locks at first send
│
├── Collections — a SECOND tree, deliberately separate from Projects: curated,
│                 nestable, shareable libraries of saved artifacts
│                 OPEN: the projects↔collections relationship. Working theory:
│                 project = where an artifact is BORN; collection = where it's CURATED;
│                 one artifact can be in both.
│
└── Global memory — org-wide notes every agent reads in every non-temporary context

Pinning (conversations or messages) is a display flag, orthogonal to all containment.
```

## 2. Actors — they live in no container

- **Agents** — the workers. A generalist (**Sage**) handles most requests and can
  delegate to specialists; **Skip** is a remote analytics specialist that runs its own
  loop (so local plan/skill mechanics don't apply to it — the UI must honestly show
  delegated capability). Each conversation routes to one agent at a time; @-mentioning
  an agent reroutes the conversation to it.
- **Skills** — capability bundles an agent may activate mid-run (user can request one
  with `/`). Activation is governed and visible after the fact.
- **Plan mode** — a per-run gate: "show me an editable plan before you act; I approve,
  edit, or reject (rejection with a reason forces a re-plan)."
  OPEN: whether the toggle is per-request or sticky-per-conversation is an active
  product debate — design may propose either, labeled.
- **Routines** — personal schedules that fire agent runs on a timer and notify; each
  run links to its conversation. Deliberately personal and project-agnostic in v1.
- **Response modes** — per-agent quality/speed presets (e.g., Draft / Standard / High).

## 3. Artifacts (deserve their own note — they're the most underestimated concept)

An artifact is a **living deliverable**, not a text block: often a working interactive
application (a data table with search/sort and clickable drill-downs, a dashboard) that
renders live inside the workspace. It accumulates **versions** — agent revisions and
human edits both append (never overwrite). It carries its **origin** (the conversation
that made it), can be **saved into collections**, **shared** (including a governed
public link), **remixed** (forked into a new conversation), and inspected through
multiple lenses (rendered view, requirements, underlying code/data, links). Some
artifacts can apply themselves to the user's real records ("apply to my form").

## 4. Flows — how work moves

- **F1 · The core loop.** You message → the agent runs (reading global + project memory
  on the way in; plan mode may insert an approval gate) → reply. Every run is inspectable.
- **F2 · Deliverables.** A run produces an artifact v1 → future turns and human edits
  append v2, v3… → optionally curated into collections; remix forks it to a new conversation.
- **F3 · Structured work.** For multi-step jobs the agent builds a task graph with
  dependencies → sub-tasks execute (more runs) → outputs land back in the conversation.
  Workspace-wide Tasks view shows all graphs (list + Gantt).
- **F4 · Memory.** Mid-conversation the agent may save a note → the user sees it at the
  moment of capture and can keep / edit / discard, and choose its scope (this project vs
  org-wide) → kept notes are read by every future run in scope; visible transparency in
  both directions ("used N notes" on replies; a manage surface listing everything, with
  edit/forget — forgetting an org-wide note warns about blast radius). Temporary chats
  skip this flow entirely.
- **F5 · Voice.** A button turns the conversation into a live call: real-time talk,
  optional live surfaces (shared whiteboard, media viewer, a browser the agent drives
  and the human can take over), delegated work spawning F1 runs — then the session
  collapses back into the thread as one reviewable card (transcript, recording,
  resumability).
- **F6 · Scheduled work.** A routine fires the F1 loop on a schedule → notification +
  linked conversation to review.
- **F7 · Sharing.** Today: per-conversation, per-artifact, per-collection with roles
  (view/edit/owner). Direction: the **project** becomes the collaboration boundary —
  members with roles see the project's conversations, memory, and artifacts.
  OPEN: what a project IS when opened (a landing page? a filter? a side panel?) is the
  single biggest open design question. Propose.

## 5. The open seams, gathered (design opportunities — propose, label as proposals)

1. Project presentation — what opening a project shows (the biggest one).
2. Nesting semantics — roll-ups, memory inheritance, sharing cascade, move rules.
3. Task graphs → project containment (assume yes; design the surface).
4. Projects ↔ collections relationship (working theory in §1).
5. Plan-mode toggle semantics (per-request vs sticky).
6. Threads: revive with a real entry point, or delete.
7. Search scope: global vs project-scoped when invoked from inside a project.
