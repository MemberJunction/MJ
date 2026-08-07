# Weekly Innovation Lab

A recurring, automated deep-dive: once a week, study the MJ repo (architecture, active PRs, open issues), study the outside world (association/nonprofit tech landscape, adjacent AI-agent platform trends, and the problems the sector is actually facing), and propose **3 new ideas** for how MemberJunction can make life better for the associations and non-profits it serves.

This is a log, not a backlog. Nothing here is committed roadmap — it's raw creative exploration, meant to be mined, argued with, and redirected. Each week gets its own dated folder. Read the most recent 2-3 weeks before starting a new one so we don't pitch the same idea twice with a different name.

**Ground rules for every week's output:**
- Ideas are framed around a real problem for a real association/nonprofit user — not "we could refactor X." Technical elegance is a means, not the pitch.
- Check what's already in flight (active PRs, other `plans/` docs) and route around it. Duplication isn't creativity.
- Each idea gets a written plan (problem, why MJ specifically, architecture sketch using *existing* MJ primitives where possible, phasing, open risks) and, if it touches UX, a full self-contained HTML mockup.
- Prefer ideas that compose with each other and with MJ's existing strengths (the unified metadata/entity layer, the AI Agent framework, Open App packaging) over ideas that require new core-platform surface area.

---

## Weeks

### 2026-08-07 — Week 1: "Report it. Keep them. Staff it."
First run of the lab. Repo study covered architecture, the last ~100 merged PRs, all `plans/` strategic initiatives, 54 open PRs, and a sample of 271 open issues. External research covered the 2025-2026 AMS/nonprofit-CRM competitive landscape, sector-wide pressures (donor/member retention, workforce burnout, data fragmentation, grant compliance burden, generational shift), and current agentic-AI platform trends (orchestration, marketplaces, observability, interoperability protocols).

Three ideas, deliberately designed to interlock rather than stand alone:

1. **[Impact Ledger](2026-08-07/impact-ledger/plan.md)** — a schema-agnostic AI agent that continuously turns entity data into funder- and board-ready impact narratives, and extracts grant obligations into trackable compliance tasks. Targets the sector's #1 reported pain point: 72% of nonprofit leaders say assembling basic impact data takes 2-7 days.
2. **[Belonging Radar](2026-08-07/belonging-radar/plan.md)** — a retention and matching layer that scores "belonging," not just churn, and proposes specific next-best-actions (including volunteer/mentor matching) for at-risk or high-potential members, donors, and volunteers. Consumes Impact Ledger's narratives as a signal; consumes Predictive Studio's scores as another. Targets "relevance fatigue," volunteer burnout, and the Gen-Z/Millennial engagement gap.
3. **[Mission Fleet](2026-08-07/mission-fleet/plan.md)** — a curated, open, installable pack of pre-built AI "crew" agents for associations/nonprofits, shipped through the existing Open App mechanism. Targets the workforce/staffing crisis directly by giving under-resourced orgs (the majority of the market) the kind of AI teammate that today only Salesforce/Blackbaud-budget organizations can afford — and does it without proprietary lock-in.

See [`2026-08-07/research-briefing.md`](2026-08-07/research-briefing.md) for the full repo and market research this week's ideas are grounded in, including the explicit list of in-flight PRs/initiatives these ideas were designed to avoid duplicating.

**Explicitly NOT re-pitched this week** (already active — see research briefing for PR/issue numbers): the unified workflow/DAG engine, entity companions & unified transaction scope, pluggable authentication, field-level security, query & entity materialization, realtime/voice session-lifecycle bug fixes, SQL Server → PostgreSQL parity, and Open App installer/CodeGen reliability hardening. All are real and valuable; none of them are "new ideas" territory this week.
