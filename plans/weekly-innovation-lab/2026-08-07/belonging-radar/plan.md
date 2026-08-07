# Belonging Radar

**One line:** A retention and matching layer that scores whether a member, donor, or volunteer *feels seen* — not just whether they're statistically likely to churn — and proposes one specific, personal next action instead of another generic email blast.

**Status:** Proposal — Week 1 of the Weekly Innovation Lab.
**Interlocks with:** [Impact Ledger](../impact-ledger/plan.md) (its Impact Moments are a first-class Belonging Radar signal), [Mission Fleet](../mission-fleet/plan.md) (ships as a crew agent), Predictive Studio (consumed as one input, not replaced).

---

## 1. The problem, in the words of the people who have it

A membership director looks at a churn dashboard and sees a red number next to five hundred names. She has no idea which five to call first, or what to say when she does. A donor gave $500 for three years running and quietly stopped — not because they ran out of money, but because they never once heard what the $1,500 actually did. A volunteer coordinator has forty open shifts and a spreadsheet of three hundred volunteers, and no way to know which twelve of them are a genuine fit for Saturday's event versus which two hundred already burned out last quarter and shouldn't be asked again.

This week's research names the pattern precisely: it's **"relevance fatigue," not donor fatigue** — total giving is roughly flat but donor *counts* are falling ~4.5%, because donors are consolidating toward the handful of organizations where they can see, concretely, that their support mattered. On the volunteer side, the workforce crisis compounds it — coordinators are stretched too thin to do the kind of personal matching that actually prevents burnout and turnover, so the same reliable ten people get over-asked while the other two hundred quietly drift.

Existing tools give you a score. None of them close the loop into "here is the one thing to do about this specific person, today."

## 2. Why MJ specifically, and why not a Predictive Studio feature

Predictive Studio already does churn/lapse scoring — that's the right home for the quantitative side of this, and Belonging Radar should not reinvent it. But a churn score answers "will they leave," not "why would they stay," and it has no concept of the qualitative signal that the research says actually matters: has this person been *shown* evidence their support mattered. That's exactly what Impact Ledger's Impact Moments produce as a side effect. Belonging Radar's real contribution is the fusion layer — blending a quantitative score (from Predictive Studio, if installed) with a qualitative "visibility of impact" signal (from Impact Ledger, if installed) — plus an orchestration layer that turns the blended score into one specific proposed action per person, routed through a human for approval before anything reaches a real donor or volunteer.

This also generalizes a second capability the sector clearly wants and doesn't have well-served today: skills/interest-based matching (volunteer-to-opportunity, mentor-to-mentee), built once as a reusable primitive rather than three different point solutions.

## 3. What it doesn't touch

- Does **not** replace or duplicate Predictive Studio's ML platform (#predictive-studio*.md) — it calls Predictive Studio's scores as an input where available, and degrades to a simpler recency/frequency heuristic where Predictive Studio isn't installed.
- Does **not** touch Conversations UX (#2953) or the messaging/communication provider layer — outreach drafts are handed to the existing Communication framework to send, not a new channel.
- Does **not** require Impact Ledger to be installed — the belonging score just loses one input signal and falls back to engagement-recency-only scoring.
- Does **not** send anything automatically. Every next-best-action is a draft in an approval queue; a human sends it. This is a deliberate, non-negotiable design constraint, not a v2 nice-to-have — AI-drafted outreach to a real donor or volunteer without review is exactly the kind of thing that erodes the trust this whole idea depends on.

## 4. What it is

### 4.1 Belonging Score
A per-person (member/donor/volunteer) score blending:
- **Momentum** — Predictive Studio's churn/lapse likelihood, where available.
- **Visibility of impact** — has this person been shown (via an approved, sent Impact Moment or equivalent communication) evidence tied to something they actually gave/did, and how recently.
- **Engagement recency/frequency** — the baseline signal, always available even with nothing else installed.

Displayed not as a single number but as a short breakdown ("high statistical churn risk, but hasn't seen any impact evidence in 9 months" reads very differently to a staff member than "high churn risk, saw an impact update last week and still drifting" — the first has an obvious next move, the second is a harder case).

### 4.2 Next-Best-Action Agent
For each person flagged as drifting (or, symmetrically, showing rising momentum worth capitalizing on), an agent proposes one specific action, always naming *why*: "Send Maria the Impact Moment about the youth program she funded in March — she hasn't seen an update in 7 months" / "Sarah hasn't been asked to volunteer in 90 days; 3 open shifts match her stated skills (event logistics, Spanish-speaking)." Every suggestion lands in a staff approval queue — approve-and-send, edit-and-send, or dismiss (dismissal reasons feed back into future scoring, e.g. "already at capacity, don't ask again this quarter").

### 4.3 Matching Engine (generalized primitive)
A reusable skills/interest matching service — given a set of "seekers" (open volunteer shifts, mentorship requests, committee openings) and a set of "candidates" (people with stated skills/interests/availability), produce ranked, explained matches. Volunteer-to-opportunity and mentor-to-mentee are the two initial applications; the service itself is generic enough that a future idea could point it at exhibitor-to-buyer matching at a conference, or member-to-committee matching, without new code.

### 4.4 Data model additions (additive only)
- `Belonging Score` — per-person, per-period, with a structured signal breakdown (not just a number).
- `Suggested Action` — agent-proposed next action, status (pending/approved/sent/dismissed), dismissal reason.
- `Matching Profile` — skills/interests/availability, reusable across volunteer and mentor matching.
- `Match Proposal` — a ranked, explained pairing awaiting staff review.

## 5. Screens (see [mockup.html](mockup.html))

1. **Belonging Radar dashboard** — a quadrant view (belonging score × momentum) across a segment, so staff see at a glance who's drifting-but-recoverable versus drifting-and-likely-gone versus thriving-and-worth-deepening, instead of one flat "at risk" list.
2. **Person detail** — the signal breakdown for one individual, their engagement/impact-visibility history, and the queue of suggested actions with approve/edit/dismiss controls.
3. **Matching queue** — side-by-side match cards (volunteer ↔ opportunity, or mentor ↔ mentee) with the stated rationale, for a coordinator to confirm or reject before an invitation goes out.

## 6. Phasing

- **Phase 0 — Belonging Score with recency/frequency only.** No agent, no external dependencies; validates the quadrant dashboard UX and gets the scoring model in front of staff.
- **Phase 1 — Fuse in Predictive Studio scores** where installed.
- **Phase 2 — Fuse in Impact Ledger visibility signal** where installed; ship the Next-Best-Action agent and approval queue.
- **Phase 3 — Matching Engine** (volunteer/mentor), as a standalone reusable service plus the two initial UIs.

## 7. Success signal

Not "did we build a scoring model." It's: when a coordinator opens this on a Monday morning, can they name the three people to call and know exactly what to say — and does the volunteer roster stop leaning on the same over-asked ten people. If dismissal reasons show staff trusting and using the suggestions (rather than blanket-dismissing), the loop is working.

## 8. Open risks / questions

- **Score legibility.** A blended score with three inputs risks becoming another opaque number if the breakdown isn't front-and-center in the UI — the mockup treats the "why" as more important than the number itself, and that discipline needs to hold through implementation.
- **Over-fitting to available signal.** Orgs without Impact Ledger or Predictive Studio installed get a much thinner score; needs honest UI about confidence level, not a number that looks equally authoritative regardless of what's actually feeding it.
- **Matching fairness.** A skills/interest matcher that always routes to the same "best fit" people risks recreating the exact over-asking burnout pattern it's meant to fix — needs an explicit recency/fairness constraint (don't over-suggest the same candidate), not just a pure best-match ranking.
