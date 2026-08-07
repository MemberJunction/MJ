# Mission Fleet

**One line:** A curated, open, free-to-install pack of pre-built AI "crew" agents for associations and nonprofits — shipped through MJ's existing Open App mechanism — so a three-person nonprofit gets the same caliber of AI teammate that today only a Salesforce- or Blackbaud-budget organization can afford.

**Status:** Proposal — Week 1 of the Weekly Innovation Lab.
**Interlocks with:** [Impact Ledger](../impact-ledger/plan.md) and [Belonging Radar](../belonging-radar/plan.md) ship as two of the crew agents; the pack is the distribution vehicle for both.

---

## 1. The problem, in the words of the people who have it

An executive director running a $400K/year nonprofit has no grants officer, no membership analyst, no dedicated IT staff, and a part-time development coordinator who's also answering the phones. This is not an edge case — it's the median nonprofit. The AI copilot wave sweeping the sector right now (Salesforce's Agentforce Nonprofit, Blackbaud's Copilot, Momentive's MomentiveIQ) is real and useful, and every single one of it is bundled with an enterprise CRM contract that this organization cannot afford. The workforce crisis this week's research documents — 95% of nonprofit leaders worried about burnout, ~50% struggling to fill roles, ~19% turnover — hits hardest exactly where there's no budget for enterprise AI tooling to absorb the gap. The result is a widening capability gap between well-funded and under-resourced missions, which is a strange thing for the nonprofit sector specifically to be reproducing.

## 2. Why MJ specifically, and why this is a *packaging* idea, not a feature idea

MJ already has everything this needs as a primitive: the AI Agent framework, the Actions boundary layer, and — critically — the **Open App** spec, a packaging/distribution standard for self-contained, installable, versioned apps that MJ adopted for exactly this purpose (schema isolation, semver via GitHub releases, `mj app install/upgrade/remove`). Mission Fleet proposes zero new core-platform surface area. It's a *reference metadata pack* — entities, agents, actions, prompts — assembled once and given away, distributed the same way any other Open App is.

This is deliberately the "framework-level" idea of the three this week: instead of building one more feature, it turns MJ's existing packaging mechanism into an equity lever. It also gives MJ a genuinely differentiated go-to-market story against the enterprise AI-copilot wave: this week's research flagged that 76-81% of enterprises worry about vendor lock-in in agent memory/orchestration — Mission Fleet is the opposite of that by construction: open-source, MIT-licensed, portable, no contract required.

## 3. What it doesn't touch

- Does **not** add anything to MJ core. It is metadata + agent/action definitions, installed as an Open App, using the mechanism exactly as designed.
- Does **not** attempt to fix Open App's known installer reliability issues (#3547, #3506, #3505, #3457, #3451, #3443, #3561 — a dense, already-tracked cluster). Mission Fleet is a *consumer* of Open App and inherits whatever robustness that mechanism has at the time; it's an argument for prioritizing that hardening work, not a duplicate of it.
- Does **not** compete with Salesforce AgentExchange as a general marketplace. It is intentionally narrow (nonprofit/association use cases only), intentionally curated (a handful of well-built crew agents, not an open submission marketplace, at least initially), and intentionally free.

## 4. What it is

### 4.1 The reference nonprofit/association data model
The one piece of genuine new ground: a minimal, optional reference schema (Donor, Gift, Program, Enrollment, Membership, Renewal, Volunteer Shift, Grant) shipped as metadata, not as required core entities. An org that already has this data elsewhere maps to it (or skips it and configures agents against its own schema directly, the same way Impact Ledger's Impact Mapping works). An org with nothing yet gets a working starting schema in one install.

### 4.2 The crew
Each crew agent is a complete, ready-to-run teammate — not a chatbot, a scoped worker with a specific job:
- **Renewal Concierge** — flags at-risk dues/membership renewals and drafts personalized outreach (consumes Belonging Radar if installed; falls back to simple recency scoring if not).
- **Grant Scout** — surfaces relevant funding opportunities and tracks compliance obligations (this *is* Impact Ledger's Grant Obligation Tracker, packaged as a crew member).
- **Event Crew Chief** — matches volunteers to open shifts and flags staffing gaps ahead of an event (this *is* Belonging Radar's Matching Engine, packaged as a crew member).
- **Community Voice** — drafts newsletter and social copy from approved Impact Moments (a thin consumer of Impact Ledger's output, packaged as a crew member).

Each agent ships with: a plain-language onboarding wizard (no code, no data modeling required to try it), a small bundled sample dataset so a non-technical ED can see it work in minutes, and a **"what this agent touches"** trust card — which entities/fields it reads, which it can write to, whether it can send anything externally without approval. This directly answers the governance anxiety this week's research flagged as a rising theme ("who is this agent, what can it touch, who approved it") — and matters more, not less, for an organization with no dedicated IT/security staff to vet it themselves.

### 4.3 Distribution
Phase 1: an MIT-licensed reference pack living in (or alongside) the MJ repo, installable today by anyone running MJ via the existing Open App tooling. Phase 2 (stretch, explicitly out of scope for this proposal's near-term plan): a small public gallery site — "Mission Fleet Hub" — for discovery, not a full marketplace; curation over scale, at least until the underlying Open App installer reliability work has matured.

## 5. Screens (see [mockup.html](mockup.html))

1. **Fleet gallery** — a card per crew agent: what it does, what it needs installed to work at full strength, the trust card summary, install button.
2. **Onboarding wizard** — three plain-language steps to get one agent (Renewal Concierge, as the example) running against real or sample data.
3. **Crew roster / control room** — once installed, one view of every active crew agent, their recent actions, and a pause/audit control per agent.

## 6. Phasing

- **Phase 0 — One crew agent, no gallery.** Ship Renewal Concierge alone as a standalone Open App, with the onboarding wizard and trust card, to prove the packaging pattern and the "working in 10 minutes with sample data" promise before building anything else.
- **Phase 1 — Reference data model + remaining crew agents** (Grant Scout, Event Crew Chief, Community Voice), each depending on Impact Ledger / Belonging Radar where relevant, degrading gracefully where not.
- **Phase 2 — Fleet gallery + crew roster/control room** inside MJ Explorer.
- **Phase 3 (stretch) — Public Mission Fleet Hub** for discovery beyond an org's own MJ instance, contingent on Open App installer reliability having matured past its current known-issues cluster.

## 7. Success signal

Not "did we ship an app pack." It's: can a nonprofit with zero engineering staff go from nothing to one working AI teammate inside a single sitting, using sample data, without reading documentation written for developers. If the honest answer requires a technical setup call, the onboarding wizard hasn't done its job yet.

## 8. Open risks / questions

- **Sequencing risk.** Two of the four crew agents depend on Impact Ledger and Belonging Radar existing — Phase 0/1 sequencing (Renewal Concierge first, since it's the most self-contained) is deliberate, but the full fleet's value is genuinely gated on those two ideas landing.
- **Free-tier sustainability.** "Free and open" is the differentiator, but somebody has to maintain the reference pack as MJ core evolves — needs an explicit maintenance owner, not just a one-time contribution, or it rots the way point-in-time reference implementations usually do.
- **Trust card credibility.** A "what this agent touches" card is only trustworthy if it's generated from the agent's actual declared permissions, not hand-written prose that can drift out of sync with what the agent really does — worth scoping as a generated artifact from day one, not a doc.
