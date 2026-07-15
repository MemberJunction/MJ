# Design Brief — Next-Gen Conversations

> One of three documents. Read together: BRIEF.md (this — what it is and what matters),
> SYSTEM-MODEL.md (the concepts and how they relate), FUNCTIONAL-CONTENTS.md (everything
> the design must find a home for). Design from these; no prior UI exists as far as you
> are concerned.

## What this product is

MemberJunction Conversations is the **agent workspace** for member-based organizations
(associations, nonprofits). Staff talk to AI agents that know the organization's real
data — members, events, finances, content — and the agents don't just answer: they
produce working deliverables, run multi-step workflows, remember what matters, and
operate under governance the organization controls. White-label products (a learning
platform, analytics assistants) are built on top of this same surface.

## Who uses it

**Association staff** — capable, non-technical professionals (membership directors,
communications managers, program leads). They live in this tool daily. They are not
prompt engineers and never want to feel like they're operating machinery; they want a
competent colleague. A secondary audience — power users and admins — configures agents
and governance, but the primary surface is for the first group.

## What makes it different from ChatGPT/Claude (design must express these)

1. **Agents are real specialists, not personas.** A generalist (Sage) can delegate to a
   remote analytics specialist (Skip). Delegation, cost, and steps are inspectable —
   trust comes from legibility, not vibes.
2. **Artifacts are live, versioned deliverables.** Not text blobs: working interactive
   applications (data tables, dashboards) that render in-place, accumulate versions from
   both agent and human edits, and can be curated into shared libraries.
3. **Work has structure.** Multi-step jobs become visible task graphs with dependencies.
   Recurring work becomes personal scheduled routines. Conversations group into projects.
4. **Memory is governed and visible.** Agents remember — per-project and org-wide — and
   the user always sees, approves, edits, and can delete what's remembered. Private
   (incognito) conversations that touch no memory are a first-class mode.
5. **Voice is a modality, not an app.** A conversation can become a live call with
   shared working surfaces (whiteboard, media, a driveable browser), then collapse back
   into the thread as a reviewable record.
6. **Sharing is organizational.** Conversations, artifacts, and libraries are shared
   with roles; the project is becoming the collaboration boundary.

## The jobs to be done

- **Ask and act**: get trustworthy answers from org data; approve agents to act on them.
- **Produce**: turn conversations into deliverables (reports, dashboards, sequences) that
  keep improving across versions.
- **Automate**: put recurring work on a schedule and monitor it.
- **Organize**: keep an initiative's conversations, memory, outputs, and people in one place.
- **Return**: come back after a week and re-orient in seconds — what ran, what changed,
  what needs me.

## Design tenets (the bar this design is judged against)

1. **Intuitive and powerful whilst not overwhelming.** The daily surface must feel calm
   to a non-technical user while ALL capability remains reachable. Progressive disclosure
   is the expected instinct: complexity should be earned by usage, not dumped up front.
2. **THE PLACEMENT RULE — nothing is dropped silently.** FUNCTIONAL-CONTENTS.md lists
   every behavior. A surface's design is complete only when every item for that surface
   has an address: visible at rest · revealed on hover/focus · in an overflow · consolidated
   into another element · or explicitly proposed for deletion. Every deliverable must
   include this placement account. A beautiful screen with unplaced items is unfinished.
3. **Trust through legibility.** Cost, steps, provenance, memory reads/writes, and
   delegation are always inspectable. Never hide what the machine did; design how it's
   revealed.
4. **States are the design.** Every surface needs: brand-new-user, sparse, established,
   heavy (long names, 12+ projects, 8 members, 30+ memories), loading, error, and
   read-only/permission-limited. A design shown only in its happy state is a vignette.
5. **Both themes are first-class.** Light and dark, token-driven (CSS custom properties),
   flat color — brand blue as the single accent family, no gradients. WCAG AA contrast
   for all load-bearing text; every hover-revealed action needs a keyboard and touch path.
6. **Desktop-first, mobile-real.** Primary is a desktop workspace; show how the shell
   collapses at tablet/phone widths.

## Deliverable expectations per session

Full-resolution screens (light + dark), the placement account (tenet 2), state coverage
(tenet 4), and a short rationale. Propose boldly — including deletions and consolidations —
but on the record.

## Opening prompt (paste to start a session)

```
You are designing the next generation of MemberJunction Conversations from a clean
slate. Attached: BRIEF.md (the product and tenets), SYSTEM-MODEL.md (concepts and
flows), FUNCTIONAL-CONTENTS.md (everything that must have a home). No prior UI
constrains you; the functional contents do.

Start with [SURFACE]. Deliver: full-resolution light + dark screens, the complete
placement account for this surface's items from FUNCTIONAL-CONTENTS.md, the states
(new/sparse/established/heavy/loading/error/read-only), and your rationale. Where
SYSTEM-MODEL.md marks an OPEN seam relevant to this surface, propose an answer and
label it as a proposal.
```
