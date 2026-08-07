# Mission Fleet

> **Application-layer idea.** This is a pack of pre-built AI agents that require an organization's
> operational data to already be stored in MemberJunction. The fleet delivers value on top of MJ's
> existing agent, entity, and Open App infrastructure — it does not extend the core framework.

## Problem

The sector is splitting. Enterprise-budget organizations now have Salesforce Agentforce Nonprofit,
Blackbaud Copilot, and MomentiveIQ. The majority of associations and nonprofits — those operating
on sub-$5M budgets — cannot afford any of these platforms, and have no access to pre-built AI
tooling designed for their workflows. The capability gap is widening rapidly.

## Why MJ specifically

MJ already has an agent runtime, an Open App distribution mechanism, and the entity graph that
gives agents their context. The only missing piece is a curated, ready-to-use pack of agents that
work out-of-the-box for common nonprofit and association workflows. MJ can close the capability gap
without building a new platform — just package what already exists.

## What it deliberately does NOT touch

- MJ's core agent infrastructure — the fleet uses agents as-is
- Any proprietary or closed-source components — everything in the fleet is MIT-licensed
- Vendor lock-in — the fleet works with any AI model provider configured in an MJ deployment

## Architecture (existing MJ primitives only)

**Mission Fleet** is an Open App containing a curated set of pre-configured `MJ: AI Agent` records,
associated `MJ: AI Prompt` templates, and optional entity extensions. Initial crew members:

| Agent | What it does |
|---|---|
| **Grant Scout** | Monitors public grant databases (via MCP/web tool) and matches opportunities to the org's program areas stored in MJ |
| **Renewal Concierge** | Identifies members approaching renewal, drafts personalized outreach based on their engagement history |
| **Board Briefer** | Produces a monthly board-ready summary from MJ entity data: membership trends, financials summary, upcoming events |
| **Volunteer Dispatcher** | Matches open volunteer opportunities to available volunteers based on skills and availability in MJ |
| **Program Reporter** | Generates funder-ready program reports from activity data stored in MJ entities |

Each agent ships with:
- A default prompt template (editable per deployment)
- A recommended run schedule (manual, weekly, or monthly)
- A human-in-the-loop review step before any external action

**Delivery:** single `mj install mission-fleet` via the Open App CLI. Free, MIT-licensed, no
external dependencies beyond what the deploying org already has in their MJ instance.

## Phasing

| Phase | Scope |
|---|---|
| 1 | Grant Scout + Renewal Concierge; Open App packaging and install verification |
| 2 | Board Briefer + Volunteer Dispatcher |
| 3 | Program Reporter; community contribution model (PRs welcome) |
| 4 | Fleet marketplace listing; usage telemetry (opt-in) for improving default prompts |

## Success signal

Mission Fleet is installable in under 10 minutes and produces its first useful output within one
working session for a nonprofit with complete data in MJ.

## Open risks

- Prompt quality: default templates must work across a wide range of org types without customization
- Data completeness: agents degrade gracefully when data is sparse, but must communicate that clearly
- Maintenance: prompt templates will drift as model capabilities evolve; needs a clear update path
