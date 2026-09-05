# Weekly Creative Exploration Log

This folder tracks a recurring weekly exercise: deeply study the MemberJunction repo, its active
PRs, issues, and prior exploration weeks, then propose 3 new **framework-level** improvement ideas
(never a specific vertical app built on top of MJ). Each week gets its own dated subfolder with:

- One Markdown plan per idea (problem framing, what's already in flight so we don't duplicate it,
  proposed architecture, phased rollout, open questions)
- A `mockups/` folder with full-HTML UX mockups for ideas that touch UX
- A `screenshots/` folder with rendered PNGs of those mockups (embedded in the week's PR description)

The goal every week is to improve the world for MJ's users — including associations and
nonprofits, a domain the sponsoring team cares about — through generic core-framework
capabilities, not by prescribing specific business applications.

## Weeks

| Week | Ideas | PR |
|---|---|---|
| [2026-08-07](./2026-08-07/) | Relationship Graph & Engagement Signal Engine · Decision Provenance Layer & AI Handoff Briefs · Accessibility-by-Default Framework Layer | [#3609](https://github.com/MemberJunction/MJ/pull/3609) (idea 3 implementation, stalled) |
| 2026-08-14 | Universal Approval Gates for Actions, Agents & Workflows · Unified Resource Governance Engine · Consent & Data Rights Primitive | [#4009](https://github.com/MemberJunction/MJ/pull/4009) (open, unmerged — plan docs not yet in this branch) |
| [2026-08-29](./2026-08-29/) | Data Health & Trust Layer · Localization-by-Default Framework Layer · Operation Safety Net (undo for bulk & agent-driven changes) | (no follow-up PR filed) |
| [2026-09-05](./2026-09-05/) | Federated Hierarchy & Roll-Up Governance Layer · Communication Suppression & Sensitive-Context Safety Engine · Data Access Sentinel (anomalous access/export detection) | _(this week's PR)_ |

## Before starting a new week

Read every prior week's plan docs in this folder first, and skim the open-PR list, so new ideas
don't duplicate or contradict work already proposed or already in flight elsewhere in `/plans`.
