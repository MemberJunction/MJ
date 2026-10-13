# Idea 2: Decision Provenance Layer & AI-Generated Handoff Briefs

**Week of 2026-08-07 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Nonprofit and association staff turnover runs roughly 19% a year, and a large share of remaining staff say they're considering leaving too. Every time a membership manager, program officer, or grants administrator walks out the door, an organization loses something no database schema captures today: **why** things are the way they are. Record Changes can tell you a grant's status field flipped from "Under Review" to "Conditionally Approved" on March 3rd — it cannot tell you *why* the reviewer made that call, what alternatives were considered, or what the new hire needs to know before their first donor call with that account. That knowledge either lived in an email thread nobody can find, or it never existed anywhere but one person's head. For mission-driven organizations already stretched thin, re-deriving that context after every departure is a quiet, compounding tax on the work that actually matters — serving members, donors, and communities.

MJ already tracks *what changed* better than almost any platform its size (Record Changes + Version History). This idea adds the missing layer: *why* it changed, and a way to hand that context to the next person automatically, using the agent framework MJ already has.

## What already exists (and why this doesn't duplicate it)

- **`packages/VersionHistory`** gives full field-level diff/snapshot/restore — the system-of-record for *what* changed. This proposal is explicitly an **annotation layer on top of**, not a replacement for, Version History. Decision Records reference the Record Change(s) they explain; they never re-implement diffing.
- **Agent memory / conversation compaction** (shipped, `plans/complete/` agent memory + conversation-compaction work) already proves MJ's agent framework can summarize long histories into compact, faithful artifacts. This proposal reuses that summarization pattern rather than inventing a new one — the Handoff Brief Agent is a thin `LoopAgentType` configuration, not new summarization infrastructure.
- **Entity Action Workflow Extensions** (in flight, `plans/entity-action-workflow-extensions.md`) closes gaps in *declarative, automatic* state-transition execution logging. Decision Records are a different thing: *human-authored* rationale captured at the moment of a judgment call, which may or may not coincide with a workflow transition.
- **Artifacts** (`packages/Angular/Generic/artifacts`) already render generated Markdown/documents beautifully. The Handoff Brief is rendered as an Artifact — no new viewer needed.

## Proposed architecture

### New entities

| Entity | Purpose |
|---|---|
| `MJ: Decision Records` | Attached to any record via CompositeKey (EntityID/RecordID). Fields: Question (what was being decided), OptionsConsidered (JSON array), ChosenOption, Rationale (free text), DecidedByUserID, DecidedAt, RelatedRecordChangeID (nullable FK — links to the Record Change this decision explains, if any), SupersedesDecisionID (self-FK — decisions can be revisited) |
| `MJ: Record Stewardship` | Tracks who is currently accountable for a record — distinct from `CreatedBy`. Fields: EntityID/RecordID, StewardUserID, AssignedAt, PriorStewardUserID, HandoffBriefArtifactID (nullable FK to the generated brief for this handoff) |

Both entities are generic — CompositeKey-based attachment means they work on *any* entity without per-entity schema changes, exactly like Record Changes does today.

### The Handoff Brief Agent

A new metadata-defined agent (`AI Agent` record, `LoopAgentType`, no new agent-type code required) that, given an EntityID/RecordID:

1. Pulls the Record Changes timeline (via `VersionHistory`) for that record and its immediate relationship neighborhood (reusing Idea 1's `RelationshipGraphEngine` if both ship, or falling back to declared FK relationships if not — this idea does not *require* Idea 1).
2. Pulls all `Decision Records` for that record, ordered chronologically.
3. Pulls linked Conversations/Artifacts and open Tasks/Actions referencing the record.
4. Synthesizes a structured brief: **Where things stand** → **Key decisions and why** → **Open items** → **Who to talk to** (drawing on Communication history) → **Watch-outs** (e.g., "renewal lapsed once before in 2024").
5. Persists the result as an Artifact linked from `Record Stewardship.HandoffBriefArtifactID`, so it's retrievable later, not just a one-time chat response.

This can run on-demand ("Generate Handoff Brief" button) or automatically whenever `Record Stewardship.StewardUserID` changes — a natural hook into the existing Entity Action framework.

### UI

- **Decision Timeline** component (`packages/Angular/Generic/decision-timeline`) — a unified timeline mixing system-recorded changes (from Version History) with human-authored Decision Records, visually distinguished, embeddable as a form tab on any entity (same dynamic-tab mechanism as Idea 1's graph panel).
- **"Log a Decision"** quick-action available anywhere a record is open — a lightweight form (Question / Options / Chosen / Why) that takes under a minute to fill in, because a decision-capture tool nobody uses is worse than none at all.
- **Handoff Brief** view — renders the generated Artifact with the timeline alongside it for verification, plus a "Request a fresher brief" action if the last one is stale.

### Why this belongs in core, not an app

Every organization built on MJ — a trade association, a university, a healthcare network, a SaaS company using MJ as its internal data platform — loses institutional memory the same way, on the same kind of record: accounts, grants, cases, opportunities, projects. The mechanism (attach rationale to any record, summarize on handoff) is completely domain-agnostic; only the prompt tone and the entities an org chooses to enable it on are domain-specific, and those are metadata/config choices left to the app builder.

## Phased rollout

1. **Phase 1** — `Decision Records` entity + "Log a Decision" quick-action + `Decision Timeline` component (pure data capture, no AI yet — valuable on its own).
2. **Phase 2** — `Record Stewardship` entity + Handoff Brief Agent + on-demand generation + Artifact rendering.
3. **Phase 3** — automatic brief generation on stewardship change, staleness detection, and an org-wide "at risk of knowledge loss" dashboard surfacing records whose steward changed but no brief was generated.

## Open questions

- Should Decision Records support attachments/links to source emails the way Communication does? (Leaning yes, via the existing file-storage abstraction, deferred to Phase 2 design.)
- Guardrails: the Handoff Brief Agent must clearly cite its sources (which Record Changes / Decision Records it drew from) so it's a verifiable summary, not a hallucinated one — this needs the same citation discipline already used in Knowledge Hub's classification agents.

## Mockup

See [`mockups/decision-provenance-handoff.html`](./mockups/decision-provenance-handoff.html) — a Handoff Brief screen showing the AI-generated brief alongside the decision timeline, as it'd appear when a new steward opens a reassigned record. Screenshot: [`screenshots/idea-2-decision-provenance-handoff.png`](./screenshots/idea-2-decision-provenance-handoff.png).
