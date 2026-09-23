---
name: review-mj-pr
description: Review a MemberJunction PR and post findings that survive scrutiny — wraps the mechanism pass with the provenance, census, anchor, dataflow and sweep gates that catch the review errors a diff alone cannot show. Use when reviewing a PR (yours or a colleague's), before posting review comments, or whenever a review's findings will reach someone else's PR thread.
---

# Review an MJ pull request

A mechanism pass — "does this code do what I claim it does" — is necessary and **not sufficient**.
Every review error worth apologizing for in this repo has been on a different axis: *whose* bug it
is, *where* it lives, and *how much* it matters. A diff does not show you any of those.

This skill is the gate list. Run the mechanism pass however you like (`/code-review` is fine, and
delegating it is fine); then no finding reaches a PR comment until it clears every gate below.

## Why this exists

A three-PR review produced eleven findings. Verification effort was real — 655 tests run, throwaway
probe specs written — and the mechanism claims almost all held up. The failures were elsewhere:

| What happened | Cost |
|---|---|
| Two findings were real bugs in a file the PR never touched, live in three other components | Recommended **holding a colleague's correct PR** for a bug it did not cause |
| One index-alignment finding was backwards — the changed line was the correctly-aligned one | A confident, specific, wrong change request |
| Two findings cited the line that *discusses* the concept, not the one containing the error | Author has to re-derive the search you already did |
| One severity claim was written without counting call sites; all 35 were already fine | "Ships broken" for something that does not |

More mechanism verification would have prevented none of these. The gates below would have caught
all of them, and each costs one command.

---

## 0. Set up so the diff is honest

**Work in a worktree.** This checkout is shared — other sessions may be working in it
concurrently. Never check a PR branch out in place.

```bash
git fetch origin pull/<N>/head:pr<N>-verify
git worktree add <scratchpad>/wt<N> pr<N>-verify
```

**Diff against the merge base, not local `next`.** A PR that merged `next` into itself will
otherwise show you noise, or hide the change you care about. Local `next` goes stale and has
produced a confident root cause for an already-fixed bug.

```bash
git fetch origin next
git diff --merge-base origin/next HEAD -- <path>     # or origin/next...HEAD
```

**Read the changeset and the author's comments before reading the code.** MJ changesets explain
*why*, and they routinely pre-answer the objection you are forming. Real examples: why
`IgnoreMaxRows` stays on a run-scoped query; why `aria-hidden` on an `aria-labelledby` target is
correct (accname §4.1); why a `Dimensions` fallback is called fatal. Flagging something the author
already rebutted in-line costs your review its credibility for the findings that are real.

Clean up when done: `git worktree remove --force <path> && git branch -D pr<N>-verify`.

---

## 1. Mechanism pass

Establish that the code does what you think. Trace it, run the package's tests, write a throwaway
probe when a claim turns on runtime or spec behavior you are reciting from memory rather than
observing. (A probe confirmed `<button>` is labelable and a `div` is not, settling two findings that
documentation had backwards.)

This part is usually done well. The gates are what follows.

---

## 2. The gates

Every finding carries all five before it is written down. A finding that cannot clear them is a
note to yourself, not a PR comment.

### Gate 1 — Provenance (the one that matters most)

**Tag every finding `introduced` / `newly-reached` / `pre-existing`.** You cannot produce the tag
without running:

```bash
git diff --merge-base origin/next HEAD -- <file containing the defect>
```

Empty output means the PR did not touch it, so it **cannot** be `introduced`.

The tag decides what you ask for:

| Tag | Meaning | Ask for |
|---|---|---|
| `introduced` | The PR wrote the defective code | A fix in this PR |
| `newly-reached` | Latent bug this PR is the first caller to hit | A follow-up issue; say plainly it is not the PR's fault |
| `pre-existing` | Live before this PR, unrelated to it | A separate issue. Never a blocker |

This distinction is the difference between *"your PR has a silent data-loss bug"* and *"your PR is
the first caller to reach a platform bug that has been live in three other forms"* — same mechanism,
opposite social meaning, and only one of them justifies blocking a merge.

When a `pre-existing` bug is serious, **file it where the defect is** and link it from the PR
comment. That is a more valuable output than a change request, and it does not hold anyone hostage.

### Gate 2 — Anchor

Cite the line that **contains** the error, not the line that discusses the concept. Falls out of
Gate 1: an anchor outside the diff must justify itself as `pre-existing` or be re-anchored.

Guard against the near-miss: a base class whose doc comment correctly describes a hazard is *not*
the bug; the bug is in whichever downstream file restates it wrongly.

### Gate 3 — Census before severity

Any claim shaped "a future X ships broken" or "callers will hit this" needs a count first.

```bash
git grep -n "<component or API>" -- 'packages/**'
```

Then say what you found. `35 call sites, all passing a specific Placeholder` turns a finding into a
nit. `no call sites yet` makes it preventive — still legitimate when the PR's own purpose is
prevention, but say so rather than implying live breakage.

State up front when findings are preventive. It is more honest and it makes the real argument
(a guard with a hole in the control that motivated it) land harder.

Not to be confused with disclosing LLM authorship (§3): that one is a standing line about how the
whole comment was produced; this one calibrates the severity of a particular finding.

### Gate 4 — Dataflow, for any alignment or aliasing claim

Before claiming indices misalign, an off-by-one exists, or an object is shared: **read the
definition of both operands.**

The inverted finding came from reasoning about one changed line without tracing that
`embeddings.vectors` derived from the *filtered* list three lines above — making the new line the
only correctly-aligned one in the block. The same discipline, applied properly, correctly caught a
component field aliasing a singleton's cached array because the engine getter returned `_field`
directly.

Same question both times: *where did this reference come from?*

### Gate 5 — Sweep before writing a fix list

If the finding is "this claim is wrong" or "this pattern is wrong," grep for every instance before
listing sites.

```bash
git grep -n -iE "<the claim, loosely>" -- '<package>/**'
```

A fix list that is 2-of-3 makes the author redo your search. Say explicitly which nearby sites are
**correct**, too — it scopes the fix and proves you looked.

---

## 3. Writing the comment

**Disclose that the review is LLM-generated, at the top, every time.** The developer is weighing
these findings against their own knowledge of code they wrote, and they need to know what produced
them *before* they start — not after the last one. Put it in the first line, in your own words, and
keep it to a sentence or two.

> Reviewed with Claude Code and checked by hand before posting. It has been wrong before — please
> push back on anything that looks like a mistake or an overreach rather than taking it at face
> value.

This is not a formality or a liability notice. The reviews that produced this skill included a
finding that was flatly backwards and two that blamed the wrong PR, and every one of those reached a
colleague's thread with full confidence and specific line numbers. **A developer who argues with a
wrong finding is the last gate, and the only one that runs outside this process** — so say plainly
that you want that, and mean it. Don't soften it to "AI-assisted," and don't bury it at the bottom
where it can only serve as an excuse after the fact.

When a developer does push back, check their claim against the code before conceding *or*
defending. Folding immediately is as unhelpful as digging in: both leave them doing the verification
you should have done.

- **Lead with what is good, specifically.** Name the thing that was hard and done well. Generic
  praise reads as padding; "the changeset explains why `IgnoreMaxRows` stays on" reads as having
  actually read it.
- **Withdraw errors in the open.** If an earlier finding was wrong, say so plainly and point at
  what is actually wrong instead. Costs nothing, buys everything.
- **Separate "before merge" from "follow-up" from "nit"** and keep the first list short. If
  everything is blocking, nothing is.
- **Ask, don't prescribe, when the fix needs a design call** the author is better placed to make —
  e.g. a value with no available source and a pre-existing circularity behind it.
- Post with `gh pr comment <N> --repo MemberJunction/MJ --body-file <file>`. Prefer a comment over
  a formal approve/request-changes unless you were asked to render that verdict.

## 4. Relaying someone else's review

Output from a delegated or forked review is a **hypothesis list, not conclusions** — most of all its
severity labels and its attribution, which are precisely the parts a diff cannot establish. Run the
gates before repeating any of it to a human or a PR thread.

---

## Quick reference

| Gate | One command | Catches |
|---|---|---|
| Provenance | `git diff --merge-base origin/next HEAD -- <file>` | Blaming a PR for a platform bug |
| Anchor | (falls out of Gate 1) | Citing the doc comment, not the defect |
| Census | `git grep -n "<api>" -- 'packages/**'` | Severity inflation |
| Dataflow | read both operands' definitions | Backwards index/aliasing claims |
| Sweep | `git grep -n -iE "<claim>"` | Partial fix lists |
