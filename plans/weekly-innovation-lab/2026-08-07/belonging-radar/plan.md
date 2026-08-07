# Belonging Radar

> **Application-layer idea.** This feature requires an organization's member, donor, volunteer, and
> engagement data to already be stored in MemberJunction. It does not extend MJ's core framework;
> it builds on top of the existing entity, agent, and Open App infrastructure.

## Problem

Donor counts are falling ~4.5% even as total giving holds flat — meaning organizations are
increasingly dependent on a shrinking pool of major donors. At the same time, volunteer burnout and
recruitment difficulty are top-reported operational challenges. Standard churn models look at
transactional recency/frequency/monetary value; they don't capture whether a person *feels seen* by
the organization. Relevance fatigue — the sense that communications are generic and impersonal —
is the root cause that churn models miss.

## Why MJ specifically

MJ holds the full relationship history: event attendance, committee participation, email open rates,
recognition history, volunteer assignments, donation cadence. A "belonging score" — how visible and
valued has this person's contribution been? — requires exactly that cross-entity view, and MJ can
compute it without a data warehouse.

## What it deliberately does NOT touch

- Email or communications infrastructure — the agent proposes an action; a human approves it
- Donation processing or pledge management
- Volunteer scheduling or shift management systems

## Architecture (existing MJ primitives only)

1. **Belonging Score Engine** — an `MJ: AI Agent` that reads a member/donor/volunteer record and
   their related activity entities, then produces a structured score across four dimensions:
   visibility (has their contribution been acknowledged?), engagement depth (quality, not just
   quantity), reciprocity (do they give AND receive value?), and trajectory (trending up or down?).
2. **Action Proposer** — for each person below a threshold, the agent drafts one specific,
   human-approvable next action (a personal thank-you, an invitation to a committee, a spotlight in
   the newsletter) with a draft message ready to send.
3. **Volunteer/Mentor Matching Engine** — a secondary agent that matches volunteers to open
   opportunities or mentorship pairings based on skills, interests, availability, and past
   engagement patterns stored in MJ entities.
4. **Radar Dashboard** — an Open App dashboard surface showing score distribution, flagged members,
   pending actions, and trend over time.
5. **Delivery** — shipped as an Open App.

## Phasing

| Phase | Scope |
|---|---|
| 1 | Belonging score computation for members; dashboard showing score distribution |
| 2 | Action Proposer with human approval workflow; draft message generation |
| 3 | Volunteer/Mentor Matching Engine |
| 4 | Longitudinal trend tracking; cohort comparison |

## Success signal

Organizations using the Belonging Radar see measurable improvement in donor retention rate and
volunteer re-engagement rate over a 12-month period.

## Open risks

- Score gaming: if staff optimize for the metric rather than the relationship, the score becomes
  meaningless — the agent must explain its reasoning, not just emit a number
- Privacy: belonging scores are sensitive; access controls must be role-gated from day one
- Data sparsity: orgs that don't record interactions have little signal to score
