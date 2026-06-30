# DOM Testing — Tooling Gameplan

**Owner:** assigned to the Angular DOM-testing rollout (PR #2863, branch `claude/phase-1-implementation-kbuuad`).
**Companion to:** [`angular-dom-testing-rollout.md`](./angular-dom-testing-rollout.md) — that doc defines *the work*; this one defines *how I intend to approach it*.

---

## The strategy in one line

**Build tooling so tests are cheap to write, then write only the highest-value tests — be the enabler, not the bottleneck.**

I am not going to personally author a test for every component. My job is to make testing *easy and consistent* so the rollout can happen (ideally distributed across teams), and to write the tests that matter most myself.

---

## Tooling roadmap (in order)

The first three make writing tests cheap and trackable; the last two keep them honest.

1. **Grow `ng-test-utils`** — the shared helper library. Small helpers so a test is a few lines, not a chore: click/read/emit helpers, fake data for components that load from the server, and `render` extensions (providers, imports, async) for the harder components. *Everything else builds on this.*
2. **Auto test-stub generator** — a tool that reads a component and emits a starter test file (using the helpers above), so people fill in blanks instead of starting from scratch.
3. **Visibility tooling** — a simple report showing which components have tests and which don't, so progress is visible and the backlog is clear.
4. **Guardrails (later)** — lint/CI rules that stop people writing tests the wrong way (naming, anti-patterns).
5. **Mutation testing (last)** — a check that proves the tests actually catch bugs, once there's a real body of tests to verify.

---

## How I'll work

- **Demand-driven, not speculative.** Build each tool *because the next real package needs it* — not a framework nobody pulls on. Start with `ng-base-forms` (top of the rollout's priority list); when it forces a helper into existence, build that helper. One move = a tool + a landed package.
- **Measured by rollout progress, not tool count.** Success = DOM coverage actually moving and packages landing — not how many tools exist. Keep one foot in the rollout so the tooling has proof and the plan visibly advances.
- **Write the high-value tests, skip the trivial ones.** Prioritize components that are used in many places and/or have a lot of template logic (gating, bindings, click→output). Skip static/trivial components. Follow the rollout doc's package priority order.

---

## Not in scope

- Testing *every* component (exhaustive coverage is a vanity goal).
- Personally authoring the entire rollout solo (the model is: I own tooling + patterns + reviews; authoring is shared).

---

## To confirm with whoever assigned me

> "I want to own the tooling, patterns, and reviews so each team can test their own components cheaply — does that match expectations, or am I also on the hook for authoring all the tests myself?"

Getting this agreed makes "focus on tooling" a sanctioned strategy, not a gap someone notices later.
