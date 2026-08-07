# Research Briefing — Week 1 (2026-08-07)

## Repo context checked

- Last ~100 merged PRs reviewed for active work streams
- All in-flight `plans/` initiatives reviewed
- 54 open PRs cross-checked (no idea in this week's lab duplicates active work)
- Representative sample of 271 open issues reviewed

## Market context

### Association/nonprofit tech landscape (2025–2026)

**Sector-wide pressures:**
- Donor counts falling ~4.5% even as total dollar giving holds roughly flat — dependency
  concentrating on fewer, larger donors
- Volunteer burnout and recruitment difficulty consistently rank as top operational challenges
- 72% of nonprofit leaders report assembling basic impact data takes 2–7 days; only 7% can do
  it in real time (sector survey data)
- Grant reporting remains largely manual; program staff spend disproportionate time on compliance
  reporting vs. program delivery

**Enterprise vs. small/mid-size gap widening:**
- Salesforce Agentforce Nonprofit, Blackbaud Copilot, MomentiveIQ now available for
  enterprise-budget organizations
- The majority of the sector (sub-$5M budget organizations) has no access to any pre-built AI
  tooling designed for nonprofit/association workflows
- This capability gap is widening as enterprise tools improve faster than prices fall

### Agentic AI platform trends (adjacent)

- Multi-agent orchestration (parallel sub-agents, agent delegation) becoming table-stakes
- Human-in-the-loop review workflows emerging as the standard UX pattern for AI-proposed actions
- Open/composable agent packs (vs. proprietary closed ecosystems) gaining traction as a
  distribution model for mid-market tooling

## In-flight MJ work this lab explicitly avoids overlapping

| Area | Relevant PR/issue |
|---|---|
| Unified workflow/DAG engine | Active in `feat/task-graph-*` PRs |
| Entity companions & unified transaction scope | Active in `feat/base-entity-composite-graph` |
| Pluggable authentication | Active in `claude/pluggable-auth-providers` |
| Field-level security | Active in `JF_Entity_Field_Security` |
| Query & entity materialization | Active in `claude/query-entity-materialization-phase2` |
| SQL Server → PostgreSQL parity | Active in `feat/3257-pg-integration-parity` and related |
| Open App installer/CodeGen reliability | Active in multiple `fix/openapp-*` and `fix/codegen-*` |
