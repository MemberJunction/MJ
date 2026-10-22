# Idea 3: Agent Behavioral Drift & Regression Detection Engine

**Week of 2026-09-12 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Picture the best-case outcome of everything the AI-agent-safety literature currently recommends:
a small nonprofit picks one repetitive workflow — drafting acknowledgment letters, triaging inbound
inquiries — guardrails it tightly, and lets it earn trust over months before expanding its scope.
That is exactly the maturity path 2026 guidance for lean organizations prescribes, and MJ's own
in-flight work (Universal Approval Gates, Agent Trust) gives that org the *pre-action* controls to
do it safely. But nobody has answered the question that shows up six months later: the model vendor
silently pushes a new version behind the same API, someone tweaks a prompt to fix one complaint and
introduces a different regression, or the underlying data distribution shifts — and the agent that
earned trust in March is no longer the agent running in September. Ninety-one percent of ML models
show measurable performance drift over time, and Gartner projects more than 40% of agentic AI
projects will be canceled by the end of 2027, largely over governance and ROI failures — not because
the agents were badly built, but because nobody could tell, after the fact, whether they were *still*
behaving the way they did when they were approved. For an organization that only reviews the agent
once, at launch, degrading quality is invisible until a board member or a donor notices something
went wrong and asks why nobody caught it.

## What already exists (and why this doesn't duplicate it)

MJ already has a rigorous regression-testing tier — this proposal is adjacent to it, not a
restatement of it:

- **The deterministic integration test tier** (`guides/INTEGRATION_TESTING_QUICKSTART.md`,
  `scripts/integration-golden-diff.mjs`) runs a fixed, hand-authored suite of test bundles and diffs
  outcomes against a golden baseline — the right tool for "did this code change break a known,
  deterministic assertion," run at build/CI time. It is not designed for, and does not attempt,
  sampling an already-deployed Agent's *non-deterministic, LLM-driven* output for a quality trend
  over time in production — a different signal entirely (a trend line, not a pass/fail gate at build
  time).
- **Universal Approval Gates** (2026-08-14 idea 1, PR #4009, unimplemented) is a *pre-action*
  permission control — "pause this specific run for sign-off before it proceeds." It never evaluates
  whether the *output* of an already-approved, already-running agent configuration is still good.
- **Agent Trust, By Default** (PR #3044, stale/unimplemented) is pre-action consent for irreversible
  tool calls — again a permission gate, not an output-quality signal.
- **Unified Resource Governance Engine** (2026-08-14 idea 2, unimplemented) tracks spend, not
  quality — an agent can be perfectly within budget while its output quality quietly collapses.
- **`MJ: AI Agent Runs`** already logs every production run in full — this proposal's only ask of
  that data is to *sample* it as raw material for building eval cases, never to duplicate or
  re-architect the logging itself.

None of the above tells an admin whether the agent behaving today is the same agent, in outcome
terms, that was approved for use months ago. That is the specific, currently-empty gap this proposal
closes.

## Proposed architecture

- **`MJ: Agent Eval Cases`** — per-Agent, human-authored (or AI-suggested, human-approved) test
  inputs paired with *rubric* criteria rather than exact-match expected output, since LLM output
  legitimately varies run to run: "response must not contain X," "must invoke the lookup tool before
  the send tool," "a secondary judge model must rate this response ≥ 4/5 against this specific
  scoring instruction." Exact-match golden-diff (the deterministic tier's approach) does not work
  here by design — this is the deliberate accommodation for non-deterministic output the deterministic
  tier does not need to make.
- **`MJ: Agent Eval Runs`** — one row per evaluation pass: which Eval Cases ran, pass/fail per rubric
  criterion, the judge-model's score and rationale, and a reference to the actual `AI Agent Run`
  record the evaluation produced — so every eval result is one click from the real, inspectable
  agent output, never an opaque score.
- **`AgentDriftEngine`** — a new scheduled-job driver in `packages/Scheduling/engine/src/drivers/`
  (the same interface every existing driver in that directory already implements — no new scheduling
  infrastructure), re-running each Agent's Eval Cases on a configurable cadence against its *current*
  live configuration (current prompt, current model, current tool wiring). It computes a rolling
  baseline pass rate and compares the latest pass rate against it; a statistically meaningful drop —
  not a single noisy sample — raises a `Drift Alert`.
- **Delivery through the existing `NotificationEngine`** — the same mechanism this exploration has
  used for every other "an engine detected something, tell a human" flow (Data Access Sentinel, Data
  Health, Suppression overrides). No new alerting channel.
- **Bootstrap without a blank page** — an "auto-suggest Eval Cases from history" action that samples
  an Agent's own past `AI Agent Run` rows (already logged, no new capture step) and proposes candidate
  Eval Cases for a human to review and approve. This applies the exact lesson the 2026-08-07
  retrospective already recorded for Decision Provenance: a capture step that depends on someone
  voluntarily filling out a form rarely gets filled out, so seed it from data that already exists.
- **Judge-model independence** — an org configures a stable, separately-pinned "judge model" for
  rubric evaluation, deliberately decoupled from whichever model the Agent under evaluation uses.
  This directly guards against the obvious circularity risk: if the same vendor pushes a silent model
  update that causes the drift, using that same model family as the judge could mask exactly the
  regression this system exists to catch.
- **Dry-run by default** — Eval Case re-runs execute with tools mocked/sandboxed unless an Agent's
  tools are explicitly marked safe for live replay, so scheduled evaluation of an Agent that sends
  real emails or writes real records doesn't itself become a source of unwanted side effects.

### UI

An **Agent Trust Trend** dashboard (Angular, L2, per Agent) — a pass-rate-over-time chart against the
rolling baseline, a Drift Alerts feed, and a side-by-side diff view for any failing Eval Case (rubric
expectation vs. actual output this run) so a human can decide whether to re-tune the prompt or accept
the new behavior as an intentional improvement rather than a regression.

### Why this belongs in core, not an app

Any application built on MJ that deploys an AI Agent for a consequential task — correspondence
drafting, data classification, triage — faces the identical question over time: is this agent still
behaving the way it did when someone approved it. The mechanism (rubric-based eval cases, a judge
model deliberately decoupled from the agent under test, a rolling-baseline trend rather than a
single-sample check) is entirely domain-agnostic; only the specific Eval Cases an org authors are
deployment-specific.

## Phased rollout

1. **Phase 1** — `Agent Eval Cases` and `Agent Eval Runs` entities, manual authoring only, an
   on-demand "run eval now" trigger, simple pass/fail reporting (no trend computation yet) —
   independently useful as a lightweight pre-deployment check even before drift detection exists.
2. **Phase 2** — `AgentDriftEngine` scheduled recurring runs, rolling-baseline trend computation, and
   `Drift Alert`s delivered through `NotificationEngine`.
3. **Phase 3** — auto-suggest Eval Cases from production history, and the full Agent Trust Trend
   dashboard with the side-by-side diff view.

## Open questions

- **Minimum sample size before trusting a signal.** A single failed Eval Case run is exactly the kind
  of noise that erodes trust in the whole feature if it fires an alert. Leaning toward requiring a
  minimum number of evaluation passes and a statistically meaningful (not single-sample) drop before
  raising a `Drift Alert` — deferred to Phase 2 design, following the same cold-start caution the
  2026-09-05 Data Access Sentinel proposal already applied to its own baseline mechanism.
- **Judge-model cost.** Running a secondary LLM call for every rubric criterion, on a schedule, adds
  real cost — mitigated by making rubric-only (non-judge) criteria the default and judge-model
  evaluation opt-in per Eval Case, so cost scales with how much an org actually wants judged rather
  than being mandatory overhead.
- **Composition with enforcement.** This proposal is explicitly detection-only in every phase above —
  it never automatically pauses or rolls back a drifted Agent. An org that wants a confirmed,
  high-severity Drift Alert to automatically require re-approval before the Agent runs again is a
  Phase 4 composition with Universal Approval Gates, not something this engine does unilaterally,
  following the same "detect vs. enforce" split the 2026-09-05 Sentinel and 2026-08-29 Safety Net
  ideas already established.

## Mockup

See [`mockups/agent-drift-trust-trend.html`](./mockups/agent-drift-trust-trend.html) — the Agent
Trust Trend dashboard showing a pass-rate trend line against its rolling baseline, a drift alert, and
the side-by-side rubric-expectation-vs-actual-output diff for a failing Eval Case. Screenshot:
[`screenshots/idea-3-agent-drift-trust-trend.png`](./screenshots/idea-3-agent-drift-trust-trend.png).

## Sources

- [IBM, "Agentic Drift: The Hidden Risk That Degrades AI Agent Performance"](https://www.ibm.com/think/insights/agentic-drift-hidden-risk-degrades-ai-agent-performance) —
  91% of ML models show measurable performance drift over time.
- [Maxim AI, "A Comprehensive Guide to Preventing AI Agent Drift Over Time"](https://www.getmaxim.ai/articles/a-comprehensive-guide-to-preventing-ai-agent-drift-over-time/) ·
  [ReliaQuest, "AI Observability & Model Drift Detection"](https://reliaquest.com/blog/ai-observability-model-drift-detection) —
  continuous regression testing against production agents as the recommended countermeasure.
- [AddWeb Solution, "Agentic AI for Nonprofit Operations" (2026)](https://www.addwebsolution.com/blog/agentic-ai-for-nonprofits) —
  the "guardrail tightly, earn trust incrementally" pattern prescribed for lean/nonprofit
  organizations, and the Gartner 40%+ agentic-AI-project-cancellation-by-2027 projection.
- [Microsoft Foundry Blog, "Build 2026 Open Trust Stack for AI Agents"](https://devblogs.microsoft.com/foundry/build-2026-open-trust-stack-ai-agents/) —
  the emerging push for portable, framework-independent agent evaluation rather than proprietary
  per-vendor trust scores.
