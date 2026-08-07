# Impact Ledger

> **Application-layer idea.** This feature requires an organization's data to already be stored in
> MemberJunction (members, events, donations, volunteer hours, grant-linked activities, etc.) before
> it can deliver value. It does not extend MJ's core framework; it builds on top of the existing
> entity, agent, and Open App infrastructure.

## Problem

72% of nonprofit leaders report that assembling basic impact data takes 2–7 days; only 7% can do it
in real time. Grant reporting, board decks, and funder updates are assembled by hand from multiple
disconnected exports — a painful, error-prone process that distracts program staff from mission work.

## Why MJ specifically

MJ already holds the raw materials: member records, event attendance, donation history, volunteer
logs, custom entities that track program outputs. The missing layer is an agent that can traverse
those entities, surface the numbers that matter to funders and boards, and draft the narrative
around them — all without requiring the association to maintain a separate BI tool.

## What it deliberately does NOT touch

- Core entity schema — all output is derived from whatever entities are already present
- MJ's reporting or RunView infrastructure — the agent reads data, it does not replace views
- Grant management or accounting — obligation tracking is lightweight task extraction only

## Architecture (existing MJ primitives only)

1. **Impact Agent** — an `MJ: AI Agent` that accepts a funder profile (program areas, preferred
   metrics) and a date range, then runs `RunView` queries across the org's entity graph to collect
   counts, sums, and narrative-supporting records.
2. **Source citations** — every claim in the output is annotated with the entity name, record ID,
   and query that produced it, so staff can verify and present with confidence.
3. **Grant Obligation Extractor** — a second agent pass that reads grant agreement text (uploaded
   as an artifact or stored in a custom entity) and emits structured `MJ: Action` tasks for each
   reportable obligation.
4. **Output formats** — funder narrative (Markdown/HTML artifact), board summary slide data (JSON),
   and CSV export for grant portals.
5. **Delivery** — shipped as an Open App so any MJ deployment can install it without touching core.

## Phasing

| Phase | Scope |
|---|---|
| 1 | Impact Agent reading standard MJ entities (Members, Donations, Events); narrative artifact output |
| 2 | Source-citation layer; staff review + approval flow before sharing |
| 3 | Grant Obligation Extractor; task creation in MJ action system |
| 4 | Custom entity schema discovery (agent reads the org's own entity graph) |

## Success signal

Staff time to produce a funder update drops from days to under 30 minutes for orgs with complete
data in MJ.

## Open risks

- Data quality: the agent is only as good as the data in MJ; sparse or inconsistent records produce
  weak narratives
- Hallucination risk: citation layer in Phase 2 is essential before any output goes external
- Funder vocabulary varies widely; Phase 1 may need per-funder prompt templates
