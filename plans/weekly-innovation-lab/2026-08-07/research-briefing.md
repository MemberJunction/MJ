# Week 1 Research Briefing — 2026-08-07

Condensed synthesis of three parallel research passes: (1) MJ repo architecture and strategic initiatives, (2) MJ's open PRs and issues, (3) the external association/nonprofit tech landscape and adjacent AI-agent platform trends. Full ideas built from this briefing live in the sibling folders.

## 1. What MJ is, and where its center of gravity is right now

MJ is an open-source, AI-native, metadata-driven application platform: point it at a schema and it generates typed entities, GraphQL APIs, Angular forms/grids, RLS security, and audit trails. Two theses in one: a data-unification platform, and a full-stack framework for building AI-native apps on top of that unified data (one isomorphic TypeScript object model across server, browser, CLI, and inside agents).

The last ~100 merged PRs on `next` skew heavily toward **agent infrastructure** (Task Graphs — a durable, server-executed workflow primitive now converged with Flow Agents; the External Agent Harness letting Claude Code/Codex/Gemini CLI drive an MJ agent turn) and **release/CI maturity** (LTS process, backport tooling, no-break policy). Steady work underneath on the data layer (Query & Entity Materialization, new external data source drivers) and dependency hygiene.

Large `plans/` initiatives and their maturity:

| Initiative | Status |
|---|---|
| Task Graphs / Flow convergence | Actively shipping (Phases 0-4 merged in ~2 weeks) |
| Predictive Studio | Platform layer built; business-UX layer (conversational model-building) in design |
| Knowledge Hub | Phases 0-5 committed, Phase 6 optional |
| Praxis (conversational assessment) | Early WBS, spinning into its own repo |
| Realtime (voice/video co-agents) | Shipped and live-tested; rough edges being fixed (see issues below) |
| Geo Features (universal map view) | Design doc, not yet built |
| Mobile App (React Native) | Phase 1 code-complete |
| Search Scopes & RAG+ | Phase 1 shipped; permission scoping flagged as the next blocker |
| Component Studio v2 | Proposal stage, no recent activity |
| eSignature Primitive | Detailed build plan, pending approval |
| External Agent Harness | Actively shipped and iterated |
| Open App Spec | Foundational and adopted; active tooling work |
| Single API Server Design | Proposal, not yet implemented |
| Multi-Database (Skyway/PG) Support | Draft, phased plan |

**Gap the repo doesn't cover**: despite the stated association/nonprofit go-to-market focus, there is no membership/dues, event/chapter, or donor/gift domain layer anywhere in the codebase or `plans/`. Predictive Studio's "renewal risk" use case is the closest proxy, but it's generic ML scoring, not a membership data model or an application experience. There's also no payments/billing primitive (eSignature just got promoted to a first-class primitive; nothing equivalent is planned for billing).

## 2. Open PRs and issues — what's actively being built, what's actively hurting

**54 open PRs.** Big strategic work in flight, all of it core-platform: the unified workflow/DAG engine (#3456, #3602, plus #3545, #3524), entity companions & unified transaction scope (#3585, breaking), pluggable authentication (#2985), Field-Level Security (#3367), Query Materialization Phase 2 (#3365), a Conversations UX rework (#2953), plus new AI capability surfaces (Groq Whisper STT #3494, Tavily/RSS actions #3492, Apollo prospecting #3491) and a large test-infrastructure push (#3542, #3033). None of this is nonprofit/association domain work — all of it is infrastructure this week's ideas need to sit *above*, not inside.

**271 open issues** (86 are automated CI-bot noise flagging that `next`'s unit-test backstop is currently flaky — a real signal, but not feature fodder). Recurring real clusters:
- **Realtime/voice agent surfaces** — the largest cluster of real bugs: session lifecycle (#3533, #3558), missing UX affordances (#3498, #3599, #3535), agent awareness gaps (#3497, #3496), provider lock-in (#3530, #3534, #3557). Actively developed but rough — not this week's territory, but worth knowing about if a future idea touches realtime.
- **SQL Server → PostgreSQL parity** — recurring across many subsystems (#3348, #3344, #3345, #3514, #3477, #3548, #3257). A major, still-incomplete cross-cutting effort.
- **Open App installer/CodeGen reliability** — a dense cluster of install-time failures (#3547, #3506, #3505, #3457, #3451, #3443, #3561). Young packaging model still finding its edges — relevant context for Mission Fleet below, which builds ON TOP of Open App rather than adding to this list.
- **Substantial feature requests worth knowing about** (not duplicated this week, but adjacent): agent presence/activity feed (#3247), Stripe Agentic Commerce Protocol (#1430), SCIM-style provisioning (#1509), audit logging (#667), collection-share notifications (#1477).

## 3. The outside world — AMS/nonprofit landscape and sector pressures

**Consolidation is the headline in nonprofit tech.** Momentive Software acquired Personify (Jan 2026) and launched MomentiveIQ, an AI layer unifying fundraising/membership/learning/volunteering/events. Virtuous acquired Momentum (Aug 2025) for agentic donor outreach. Salesforce rebranded Nonprofit Cloud into **Agentforce Nonprofit** (Dec 2025) with purpose-built agents (Prospect Research, Participant Management, Volunteer Capacity, Donor Support) and merged its marketplace into **AgentExchange** (10,000+ apps, 1,000+ prebuilt agents). Blackbaud shipped a Copilot for natural-language data interaction across Raiser's Edge NXT/Financial Edge NXT.

**The AMS layer specifically lags.** Of the dedicated association-management vendors (iMIS, Fonteva, Nimble AMS, Glue Up), only a few have *shipped* (not just announced) AI features. This is real whitespace — and importantly, all of the above (Agentforce, Blackbaud, MomentiveIQ) is priced and positioned for organizations that can afford enterprise CRM contracts. Small and mid-sized nonprofits and associations — the large majority of the ~1.5M nonprofits and tens of thousands of associations in the US — are not the target market for any of it.

**Sector pressures, evidenced (not vibes):**
- **"Relevance fatigue," not donor fatigue** — total giving roughly flat (~$592.5B in 2024) but donor *counts* fell ~4.5%; donors are consolidating giving toward orgs where they see tangible, direct evidence of impact.
- **Workforce crisis is the top concern** — 95% of nonprofit leaders worry about burnout, ~50% struggle to fill roles, turnover runs ~19% vs ~12% cross-sector, replacing staff costs 33-200% of salary.
- **Data fragmentation blocks impact reporting** — 72% of nonprofit leaders say assembling basic operational/financial data takes 2-7 days; only 7% can do it in real time.
- **Grant/compliance burden** — manually tracking funder requirements and compliance deadlines is cited as a severe contributor to development-staff turnover.
- **Generational shift** — Millennials + Gen Z will be >70% of the workforce by 2031; both show 2-3x higher engagement when offerings tie to mentoring/volunteering/chapters rather than generic content, and live on Discord/Slack/LinkedIn rather than member portals.

**Agentic AI platform trends worth adapting** (not nonprofit-specific): multi-agent orchestration is now default architecture; agent observability/eval is becoming a first-class, built-in concern rather than a bolt-on; MCP and A2A are consolidating as the two-layer interoperability standard; every major cloud vendor now ships an agent marketplace, and 76-81% of enterprises worry about the resulting vendor lock-in — a real opening for an open alternative; "who is this agent, what can it touch, who approved it" (agent governance) is becoming as important as agent capability.

## 4. What this points to

Three threads, none of them already being pulled on in MJ, all evidenced by the research above, and all buildable on existing MJ primitives without touching the infrastructure work in flight:

1. Nonprofits can't prove their impact fast enough to satisfy funders and boards, and MJ's core unified-entity architecture is a near-perfect fit for automating that proof — **Impact Ledger**.
2. Nonprofits are quietly losing donors, members, and volunteers not to fatigue but to *invisibility* of impact, and existing churn-scoring tools don't close the loop into a specific, personal next action — **Belonging Radar**.
3. The AI-copilot wave in nonprofit tech is entirely priced for organizations that already have Salesforce/Blackbaud budgets, leaving the majority of the sector behind, and MJ already has the packaging mechanism (Open App) to fix this for free — **Mission Fleet**.

Full sourcing for the market research claims above is preserved in the sub-agent transcript for this session; the key sources were Salesforce's Agentforce Nonprofit and AgentExchange announcements, Momentive/Personify and Virtuous/Momentum acquisition coverage, Blackbaud's Copilot product updates, the Funraise 2026 State of the Nonprofit Sector report, Council of Nonprofits workforce-shortage reporting, and Higher Logic's 2026 association trends report.
