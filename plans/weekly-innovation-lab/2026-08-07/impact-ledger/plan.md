# Impact Ledger

**One line:** An AI agent that watches an organization's existing data and continuously turns it into funder- and board-ready proof of impact — instead of a development director spending 2-7 days assembling it by hand, every time someone asks.

**Status:** Proposal — Week 1 of the Weekly Innovation Lab.
**Interlocks with:** [Belonging Radar](../belonging-radar/plan.md) (consumes Impact Ledger's narratives as an engagement signal), [Mission Fleet](../mission-fleet/plan.md) (ships as one of the crew agents).

---

## 1. The problem, in the words of the people who have it

A program director runs a youth mentorship cohort. A grants officer needs a two-page update for a foundation by Friday. A board member wants to know, in the Thursday meeting, whether the spring campaign is actually working. None of these people want a dashboard — they want a paragraph they can trust, with the receipts behind it.

Right now that paragraph gets written by hand, from memory and a scramble through spreadsheets, CRM exports, and whatever the program team emailed last month. The research for this week is blunt about the scale of this: **72% of nonprofit leaders say it takes 2-7 days to assemble basic operational/financial data; only 7% can do it in real time.** That lag isn't a minor inconvenience — it's the difference between a funder renewing a grant and a funder quietly moving on, and it's a top contributor to development-staff burnout and turnover (nonprofit turnover runs ~19% vs ~12% cross-sector).

This is not a reporting-tool problem. Every AMS/CRM has a report builder. The problem is that "impact" isn't one query — it's a narrative that has to be assembled, with judgment, from donations, program enrollments, outcomes, event attendance, and grant terms that all live in different tables (or different systems entirely), and it has to be re-assembled every single time someone asks, because the underlying data changed since last time.

## 2. Why MJ specifically

This is the one place where MJ's core architectural bet — a single, typed, metadata-driven entity layer sitting over whatever schema an organization actually has — stops being a developer convenience and becomes the actual product. MJ already knows, generically, what fields exist on what entities, how they relate, and (via Record Changes) how they've changed over time. Impact Ledger doesn't require a new data platform; it requires an AI Agent that's told *where the meaningful facts live* and *asked to keep writing about them*.

Crucially, MJ has no fixed donor/program/grant schema (confirmed in this week's repo research — that's a real gap, and **Mission Fleet** proposes filling it with reference metadata). Impact Ledger is designed to work whether or not that reference model exists, via a lightweight **Impact Mapping** configuration (see §4) rather than requiring specific entities. That makes it useful immediately to any org already running MJ over an imported Salesforce/Blackbaud/custom schema, not just orgs that adopt a prescribed nonprofit data model.

## 3. What it doesn't touch

This proposal deliberately sits entirely in application/metadata space and touches none of the infrastructure currently in flight:
- Does **not** modify the Task Graph / DAG engine (#3456, #3602) — Impact Ledger's background watcher is *a consumer* of the existing AI Agent + Action framework, scheduled like any other agent.
- Does **not** touch entity companions / unified transaction scope (#3585), pluggable auth (#2985), or Field-Level Security (#3367) — it reads through the existing permission model as any user-facing agent must.
- Does **not** rebuild Knowledge Hub's RAG/classification pipeline — grant-document extraction (§4.3) is a thin, purpose-specific consumer of the existing document-ingestion + vector search primitives, not a new indexing system.
- Does **not** compete with Predictive Studio — Predictive Studio produces scores; Impact Ledger produces narrative. (Belonging Radar is the piece that fuses the two.)

## 4. What it is

### 4.1 Impact Mapping (configuration, not new core surface)
A short, org-specific config (a metadata record, editable by a business admin, no code) that says: "gifts live on entity X, field Y is the amount, field Z is the fund/program it's restricted to; programs live on entity A; outcomes/enrollments live on entity B, linked to A by field C." This is the only setup cost. Everything downstream is generic against this mapping. An org with a clean nonprofit schema (e.g. one installed via Mission Fleet's reference pack) fills this out in five minutes; an org with a messier legacy schema still gets full value, they just point at more fields.

### 4.2 Impact Moments (the continuous layer)
A scheduled AI Agent watches for meaningful entity changes within the mapped scope — a grant milestone hit, a program crossing an enrollment threshold, a fund reaching an outcome tied to its restriction — and drafts a short, sourced **Impact Moment**: one or two sentences, machine-generated, always carrying a citation back to the specific records that justify the claim ("$12,400 in Q2 restricted funds; 40 new enrollments, Youth Mentorship, since 2026-03-01 — [view records]"). Moments are drafts by default; a human approves, edits, or discards with one click before anything is "published" to the timeline. This is a deliberate trust boundary: the agent never speaks for the organization unsupervised (mirrors the sector's well-founded wariness of AI-generated donor-facing content).

### 4.3 Grant Obligation Tracker
A narrower, document-driven sibling: point it at a grant agreement (PDF/DOCX upload, or an existing Knowledge Hub-indexed document), and it extracts obligations — reporting deadlines, spend restrictions, required deliverables — into trackable `Grant Obligation` records, each linked to an Action/reminder. This directly targets the research finding that manual compliance tracking is "a severe retention issue" for development staff. Extraction is agent-drafted and human-confirmed before anything becomes an authoritative deadline.

### 4.4 Board Packet / Funder Report Composer
On demand: pick an audience (board, a specific funder, an annual report) and a date range. The agent assembles a draft document from the approved Impact Moments in scope, plus summary figures pulled live from the mapped entities, with every claim still clickable back to source records. Output goes through the existing Artifact system (versioned, exportable) — this reuses, not replaces, existing document/export machinery.

### 4.5 Data model additions (all new, additive metadata — no changes to existing entities)
- `Impact Mapping` — one row per org, points at existing entities/fields.
- `Impact Moment` — draft/approved narrative snippet, with a `SourceRecords` link table (polymorphic, entity + record ID pairs) for citations.
- `Grant Obligation` — extracted requirement, due date, status, source document reference, linked Action.
- `Impact Report` — a composed packet (Artifact reference), its audience, date range, and the Impact Moments it drew from.

## 5. Screens (see [mockup.html](mockup.html))

1. **Impact Timeline** — a chronological feed of Impact Moments, filterable by program/fund, each showing its draft/approved state and its source citations inline. This is the "morning digest" screen for a development or program director.
2. **Grant Compliance Tracker** — a table of tracked grants, each with extracted obligations color-coded by urgency (met / upcoming / at risk), and a detail drawer showing the source document passage an obligation was extracted from.
3. **Board Packet Composer** — an audience/date-range picker that shows the agent assembling a draft packet section by section, with a running citation count, before export.

## 6. Phasing

- **Phase 0 — Impact Mapping + manual Impact Moment authoring.** Ship the config UI and the timeline screen with human-authored moments only (no AI drafting yet). Validates the citation/timeline UX and gets the data model in front of real users before any agent writes anything.
- **Phase 1 — AI-drafted Impact Moments.** Add the background watcher agent; all output stays draft-until-approved.
- **Phase 2 — Grant Obligation Tracker.**
- **Phase 3 — Board Packet Composer.**
- **Phase 4 (stretch)** — auto-suggested Impact Mappings (agent proposes a mapping by inspecting the org's schema, human confirms) to cut the setup step further.

## 7. Success signal (framed for the user, not the codebase)

The test isn't "did we ship a report builder." It's: does a development director, mid-conversation with a funder, have a true, sourced sentence ready in seconds instead of days. If an org's average time-to-answer for "how's program X doing" drops from days to minutes, this worked.

## 8. Open risks / questions

- **Trust calibration.** Draft-until-approved is the right default, but if approval friction is too high nobody uses it. Needs real usability testing on the approve/edit flow, not just a design opinion.
- **Mapping quality on messy schemas.** Orgs with genuinely inconsistent data (no consistent "amount" field, funds tracked in free text) will get weak Impact Moments no matter how good the agent is — worth an explicit "mapping confidence" indicator rather than silently producing mediocre narrative.
- **Citation format for non-technical board members.** "Click to view records" needs to degrade gracefully into a printed PDF board packet, where nothing is clickable — probably footnotes with plain-language record descriptions.
