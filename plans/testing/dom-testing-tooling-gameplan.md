# DOM Testing — Tooling Gameplan

**Owner:** assigned to the Angular DOM-testing rollout (PR #2863, branch `claude/phase-1-implementation-kbuuad`).
**Companion to:** [`angular-dom-testing-rollout.md`](./angular-dom-testing-rollout.md) — that doc defines _the work_; this one defines _how I intend to approach it_.

---

## The strategy in one line

**Build tooling so tests are cheap to write, then write only the highest-value tests — be the enabler, not the bottleneck.**

I am not going to personally author a test for every component. My job is to make testing _easy and consistent_ so the rollout can happen (ideally distributed across teams), and to write the tests that matter most myself.

---

## Tooling roadmap (in order)

The first three make writing tests cheap and trackable; the last two keep them honest.

1. ✅ **Grow `ng-test-utils`** — the shared helper library. Small helpers so a test is a few lines, not a chore: click/read/emit helpers, fake data for components that load from the server, and `render` extensions (providers, imports, async) for the harder components. _Everything else builds on this._ **Shipped:** `renderComponentFixture` (+ `providers`/`imports`/`declarations`), `renderTemplate`, `createFakeProvider`, `useFakeGlobalProvider`, dom-helpers.
2. ✅ **Auto test-stub generator** — a tool that reads a component and emits a starter test file (using the helpers above), so people fill in blanks instead of starting from scratch. **Shipped:** `scripts/gen-dom-stub.mjs` (parses via the shared `scripts/lib/component-surface.mjs`, bootstraps the package's DOM config).
3. ✅ **Visibility tooling (first iteration)** — `scripts/dom-test-report.mjs`. Goes beyond "has a spec file?": per component it scores **solid / partial / stub / none**, how many of its named behaviors (`@Output`s, `[class.X]`, `[attr.X]`) the spec actually references, and **how heavily the component is used** — so the backlog ranks by leverage (it surfaced `MjFormFieldComponent`: 4,144 usages, 0 DOM tests). Skipped/deferred components still count as gaps, annotated with why. Reuses the generator's parser so it scores against the same surface. (Deliberately leans on this rather than re-deriving Vitest's line coverage; deeper coverage signals can fold in later.)
4. **Guardrails** — lint/CI rules that stop people writing tests the wrong way (naming, anti-patterns). **Lands with Phase 4** (CI gates).
5. **Mutation testing** — a check that proves the tests actually catch bugs, once there's a real body of tests to verify. **Lands with Phase 4.**

---

## How I'll work

- **Demand-driven, not speculative.** Build each tool _because the next real package needs it_ — not a framework nobody pulls on. Start with `ng-base-forms` (top of the rollout's priority list); when it forces a helper into existence, build that helper. One move = a tool + a landed package.
- **Measured by rollout progress, not tool count.** Success = DOM coverage actually moving and packages landing — not how many tools exist. Keep one foot in the rollout so the tooling has proof and the plan visibly advances.
- **Write the high-value tests, skip the trivial ones.** Prioritize components that are used in many places and/or have a lot of template logic (gating, bindings, click→output). Skip static/trivial components. Follow the rollout doc's package priority order.

---

## Not in scope

- Testing _every_ component (exhaustive coverage is a vanity goal).

---
