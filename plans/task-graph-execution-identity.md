# D1 — Execution identity for durable task graphs

**Status**: design note, no code. Carried since Round 1 of the task-graph hardening.
**Decision needed from**: whoever owns the security model, not the next person who trips over it.

---

## The question in one sentence

**Which `UserInfo` does a durable task run as, when the run that submitted it is over?**

## Why it has no answer today

An in-run action inherits the caller. A durable graph cannot: the dispatcher executes it minutes or
days later, in a different process, after the submitting agent run has parked or finished. Something
has to supply an identity, and today three different things do, none of them stated as a decision:

| Path | Runs as | Where it comes from |
|---|---|---|
| Dispatcher poll → task execution | the dispatcher's own `contextUser` | whatever `StartTaskGraphDispatcher` was constructed with — in practice the server's system user |
| Human step settlement | the answering user | the request row, correctly |
| Remote `TaskGraph.Submit` | the caller, at submit time only | never carried past the row |

`Task.UserID` records who a step is *assigned* to, not who it *runs* as, and the two are read as if
they were the same thing in places.

## Why it matters more now than in Round 1

Three things landed since, each widening the gap:

- **Cost rollup** (R2-2/R3-8) attributes a graph's spend back to the submitting run. Spend attributed
  to a run whose user did not authorize the work is a reporting answer nobody can defend.
- **The debug verbs** (#3770) let a person pause, step, force-complete and override edges on a graph
  they did not submit. Authorization for those is `taskgraph:execute` on the *caller*, but the work
  released still runs as the dispatcher.
- **The invocation envelope** (R3-3) carries `data`/`context` from the submitter into conditions
  evaluated later. Whatever it holds is now read under the dispatcher's identity.

## The three candidate models

**A — Run as the submitter.** Persist the submitting user on the graph and execute every task as
them. Matches the intuition ("my workflow does what I could do") and makes cost attribution
coherent. Costs: identity outlives the session that created it, so a revoked or deleted user leaves
graphs that cannot run, and a long-lived graph carries an authorization decision made long ago.

**B — Run as the system, authorize at submit.** What effectively happens now, made explicit: the
submitter's permissions are checked when the graph is *written*, and execution runs as a service
identity. Simple and robust to user lifecycle. Costs: a graph is a privilege-escalation vector if
submit-time checks miss anything, and per-step row-level security is gone — the dispatcher sees
everything.

**C — Run as the submitter, revalidated at execution.** A hybrid: carry the identity, re-check
authorization at claim time, and fail the task loudly if it no longer holds. Most correct, most
expensive, and needs a definition of "still authorized" that nothing currently expresses.

## Recommendation

**B, stated and enforced, as the near-term answer; C as the shape to grow into.** B is what the
system already does, so writing it down costs nothing and immediately makes the gap auditable — the
danger of an undocumented default is that everyone assumes whichever of A/B/C suits their reasoning.
The work B implies is not nothing: submit-time authorization has to actually be a gate rather than an
assumption, which today it is not on every path.

A is tempting and should be resisted until user lifecycle is answered: MJ has no story for "this
user is gone, what happens to their durable work", and A creates that problem at scale.

## What would have to change either way

1. **Name the identity on the row.** `Task.UserID` cannot serve two meanings; a durable graph needs
   an explicit "runs as" separate from "assigned to".
2. **Make submit-time authorization a gate**, on all three submit paths — agent, remote operation,
   messaging — rather than the two that happen to check.
3. **Decide what the debug verbs authorize.** Pausing someone else's graph is arguably fine;
   force-completing a step in it is arguably not, and today they carry the same scope.
4. **Make cost attribution follow the decision** rather than the current implicit one.

## Explicitly not in scope

Delegation, impersonation, and per-step identity overrides. Those are features; this is the absence
of a decision underneath them, and adding features on top of it is how the absence becomes permanent.
