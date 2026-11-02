# Release Engineering Runbook

Operator manual for MJ releases. Audience: whoever is running the release — the release
engineer for routine Edge releases, the certification owner for cuts, line builds, and flips.

- Policy (the *why* and the rules): [`plans/lts-process.md`](../plans/lts-process.md) — canon.
- Concepts for everyone else: [`VERSIONING.md`](../VERSIONING.md).
- Machine-readable release state: [`release-lines.json`](../release-lines.json).

There are four distinct operations. Know which one you're doing before you start:

| Operation | Frequency | Who | Automation today |
|---|---|---|---|
| 1. Routine Edge release | on demand | Release engineer | Reviewed PR: `release/*` prep branch → `main` |
| 2. LTS candidate cut | per cycle (~bimonthly) | Cert owner | Button (`cut-candidate` job) |
| 3. LTS line patch release | as fixes land on a line | Cert owner | **One button** (`Publish LTS line release` workflow) |
| 4. Certification flip | once per certification | Cert owner | Scripted-manual |

> **Red publish run with an open `chore/backmerge-v*` PR?** That is a designed state, not a
> broken one — the release shipped and only the back-merge is outstanding. Go straight to
> [*Recovery: released, but the back-merge did not land*](#recovery-released-but-the-back-merge-did-not-land)
> and do not re-run the release.

---

## 1. Routine Edge release

**A reviewed PR from a `release/*` prep branch into `main`.** There is no button, and that
is deliberate — see *Why there is no button* below.

1. Cut `release/vX.Y-prep` from the `next` commit you intend to release, and push it with
   same-named remote tracking.
2. Run [`DEPLOYMENT.md`](../DEPLOYMENT.md) Steps 0–8 **on that branch**. Every release has
   prep: the AI-model PR, a metadata-sync migration, PG counterparts, npm placeholders for
   new packages, the integration suite.
3. Open a PR `release/vX.Y-prep → main` and merge it once checks pass.

```
next ──●──────────────────────────●────────────►   keeps moving throughout
       │ cut here                  ▲
       └── release/vX.Y-prep ──────┼──► PR → main ──► publish.yml
                 (Steps 2–8)       └────────── back-merge main → next
```

**`next` is never frozen and nobody stops merging.** Prep runs for hours; because the branch
was cut at a known commit, whatever lands on `next` afterwards rides the *next* release.
**The branch is the pin** — there is no separate pinning mechanism to remember.

The push to `main` triggers `publish.yml`, which does everything else — this has always
been the automatic half: `changeset version` (pre mode → the next `X.Y.0-edge.N`), the
version-grammar guard, build, `changeset publish --tag edge`, the release commit +
`vX.Y.0-edge.N` tag, a GitHub prerelease (never latest), and the merge of `main` back
into `next` with a lockfile update.

Verify afterwards: `npm view @memberjunction/core dist-tags` — **`edge` moved,
`latest` did not**; the GitHub Release exists, marked prerelease, not latest.

**Then write the canonical release notes** — the one piece of a release no workflow
produces. Run `/notes` to generate [`releases/v<version>.md`](../releases/) and PR it into
`next` ([`DEPLOYMENT.md`](../DEPLOYMENT.md) Step 11). It goes *after* publish because the
filename carries the version `changeset version` just computed. Nothing fails if you skip
it; the release simply has no notes anyone reads. During the Edge era the file is committed
but does not render publicly — `docs.yml` builds `lts/5`, not `main` — so write it for the
record and expect it to appear when versioned docs land.

Guard behavior you may hit: `publish.yml` **hard-fails an unsuffixed 6.x version** on this
path. That is the era gate doing its job — a plain version (a candidate) must never ship
through the routine pipeline. Stop and find the cert owner; don't work around it.

Never run `changeset pre enter` or `changeset pre exit` in this operation. Pre-mode state
changes only during era opens and candidate cuts (operation 2).

### Why there is no button

There was one — `release-edge.yml`, built 2026-08-03, which merged `next → main` on a
guarded manual dispatch. It was deleted without ever having been dispatched, because the
workflow it encoded cannot be correct:

- **Every release needs prep.** There is no prep-free Edge release, so a button that ships
  the tip of `next` always ships something whose Steps 0–8 were never run. Its guards
  checked CI only, and CI going green says nothing about whether a metadata-sync migration
  was generated.
- **Prep must be reviewed.** A metadata-sync migration is permanent, append-only history.
  The PR into `main` is the review instrument for it; a button bypasses review entirely.

Pointing the button at a prep branch would fix the first problem and make the second worse.
Merging a reviewed PR is already a single click, and `publish.yml` does everything after
the push — so there was nothing left for a button to add.

The LTS line release (operation 3) remains a button and is unaffected: line patches ship
backported fixes that were already reviewed on `next`.

---

## 2. LTS candidate cut (the pre-exit dance)

Trigger: the cert owner declares the stream ready ("current `6.1.0-edge.N` is our candidate").
The cut is built from the **newest published Edge tag of the line** (`v6.1.0-edge.N`), not
the tip of `next`: the candidate is exactly what shipped as Edge, minus the suffix. It is one
workflow dispatch, takes about as long as an Edge release, and freezes nothing: anything merged
to `next` after that tag (including during the run) is not in 6.1.0 and rides the next stream.

Actions -> "Build and publish new package versions" -> Run workflow -> leave the ref at
`next` -> `cut_line: 6.1` -> `confirm_branch: lts/6.1`. That is invocation 4 in
`publish.yml`; the job is `cut-candidate`, the logic is `ci/candidate-cut.mjs`.

**Before you press it** (the job checks all of these and refuses otherwise):

1. `release-lines.json` on `next` carries `lines["6.1"]` as `{ "status": "candidate",
   "candidateDate": "YYYY-MM-DD" }`. That is a reviewed PR (CODEOWNERS: the cert owner);
   status fields never arrive by direct push, so the job only appends the mechanical
   `newest` and `releases` fields afterwards.
2. The Edge build you mean to certify is the newest one. The job resolves the highest
   `v6.1.0-edge.N` tag and refuses if there is none, if that tag's tree is not that version
   in Edge pre-mode, or if npm does not have it with `edge` pointing at it (an Edge release
   in flight, or a tag npm never got). It logs how many commits `next` is ahead of the tag;
   those are not in the candidate. If they should be, run an Edge release first.
3. That Edge release finished landing: `main` is still at the Edge tag's commit, and the tag
   is an ancestor of `next` (its main -> next back-merge landed; if a back-merge fallback PR
   is open, merge it first). A non-release commit pushed straight to `main` after the tag
   (a `[skip ci]` lockfile reconcile, say) also fails this: release `edge.(N+1)` first and cut
   that.
4. Nothing named `lts/6.1`, `v6.1.0` or `@memberjunction/core@6.1.0` exists yet.

**While it runs, merge nothing into `main`** (no `release/*` -> `main` PR). A push to main
queues an Edge release behind the cut that would publish a build of the stream the cut just
closed and back-merge it into `next`. The job re-checks `main` after `version` and again
right before the publish, and refuses with nothing published if it moved; once 6.1.0 is
tagged or on npm, the Edge job itself refuses to publish any `6.1.0-edge.*`. Merges into
`next` are fine throughout.

Also, once per repo and not something the job can do: an admin creates a ruleset for
`lts/**` (pull request required, no force-push, no deletion). `lts/5` was found unprotected
on 2026-09-03; a line born without the ruleset stays that way until someone notices.

**What the job does**, in an order where nothing is pushed until the packages are on npm:

1. Preflight (above, on `next`), then check out the Edge tag (detached) and from it
   `changeset pre exit`, `changeset version` (the changesets present at the tag resolve;
   every `@memberjunction/*` package versions to plain **`6.1.0`**),
   `pnpm install` and a lockfile commit, and a frozen install as the proof the lockfile is
   in sync. All local commits so far.
2. Pre-publish check: `main` still at the Edge tag, and a trial merge (`git merge-tree`)
   of the candidate into `origin/next` with no conflict outside `package.json` files and
   the lockfile, the right changeset partition, and every internal dependency spec on `next`
   one the sync can move to 6.1.0 (an exact version or this line's Edge range; `workspace:`
   is left alone). Then build, the same check again, and
   `changeset publish --tag lts-6.1`.
3. Commit the post-release generated files, tag **`v6.1.0`** and push the tag, whether or
   not the publish succeeded, so the commit npm was built from is on origin before
   anything else can fail. Then verify against the registry (`lts-6.1` points at 6.1.0,
   `latest` did not move), create **`lts/6.1`** at the tag and the GitHub Release with
   `--latest=false`. All before anything touches `next`.
4. Check out `origin/next` and merge `v6.1.0` into it: `next` takes 6.1.0's versions and
   changelogs, loses the changesets 6.1.0 consumed, and keeps every changeset merged after
   the Edge tag (the job asserts exactly that set survives). `package.json` and lockfile
   conflicts (the candidate's pin rewrite against post-tag dependency edits; 14 files in a
   typical Edge window) resolve to `next`'s side; then, as a fixed-group release would, every
   workspace `@memberjunction/*` package's version and every exact or Edge-range pin on one
   moves to `6.1.0`, whatever it was (packages added after the tag, or landed at 6.0.0 from
   a long-lived branch, included), the lockfile is regenerated the way the Edge back-merge does it and proven with a
   frozen install, and the whole fixed group must be at 6.1.0. Then `changeset pre enter edge`
   (fresh `pre.json`: every initial version 6.1.0, nothing marked released) plus the seed changeset
   (`.changeset/open-6-2-edge-stream.md`, a `minor`), so the next routine release is
   `6.2.0-edge.0` and carries the kept changesets. Without the seed a patch-only
   merge would version Edge to `6.1.1-edge.0`, which the line's own first patch owns; this
   was reproduced on a scratch clone, so the seed is load-bearing, not a courtesy.
5. Push `next` (merging in anything that landed during the build, bounded retries, with the
   same resolver and version/pin/lockfile sync), append `lines["6.1"].newest` and
   `releases["6.1.0"]` to the ledger, dispatch docs and release notes.

**If it fails.** Before the publish step: `next`, npm and GitHub are untouched, re-dispatch.
After it: the packages are on npm and the run stops red at the first step it could not
complete. That is "released, not yet recorded", the same posture as every other release path
here; finish the remaining steps by hand from the run log, do not re-run (a re-dispatch
refuses, because npm has 6.1.0).

If the publish step failed **before anything reached npm** (`npm view @memberjunction/core@6.1.0`
is empty and no other `@memberjunction/*@6.1.0` exists), delete the pushed `v6.1.0` tag and
re-dispatch. Otherwise finish forward.

If it stopped at or after "Merge v6.1.0 into next" (the tag, `lts/6.1` and the GitHub Release
exist; `next` is untouched until "Push next" succeeds). First check whether `next` already
contains the candidate (`git merge-base --is-ancestor v6.1.0 origin/next`). If it does, only
the ledger step is left: skip to the last command below. If it does not, redo the job's own
steps locally, so nothing is rewritten by hand:

```bash
git fetch origin --tags && git checkout --detach v6.1.0
# next's copy of the scripts, as the workflow stages it (the tag's may be older):
git show origin/next:ci/candidate-cut.mjs > /tmp/candidate-cut.mjs
git show origin/next:ci/back-merge.mjs > /tmp/back-merge.mjs
node /tmp/candidate-cut.mjs merge-into-next --line 6.1 --edge-tag v6.1.0-edge.N
node /tmp/candidate-cut.mjs reenter --line 6.1
git push origin HEAD:refs/heads/fix/cut-6.1-next   # then open a PR into next (it is protected)
```

`merge-into-next` asserts the changeset partition and the fixed group itself. After the PR
merges, append the ledger by hand from a checkout of `next`:
`node ci/append-release-line.mjs --version 6.1.0 --since <describe of v6.1.0^> --until v6.1.0`,
as the workflow step does, and open it as a PR too.

**Afterwards.** Open the certification tracking issue; gates run against 6.1.0 **on
`lts/6.1`**, whose history is the Edge tag's commit plus the exit and version commits. A fix
that merged to `next` after the Edge tag and belongs in the line is a backport like any
other: label `backport lts/6.1` -> bot cherry-picks -> line patch builds (6.1.1, 6.1.2, ...)
via operation 3. Certification names whichever build passes.

Pinning an Edge build *older than the newest* is not something the job supports, on purpose:
the newest Edge tag is what Edge users are running, and cutting behind it would ship a
candidate that is older than the stream it closes. Run the cut before the next Edge release,
or certify the newest one.

---

## 3. LTS line patch release

One button, but read the inputs before you press it: the workflow is **`publish.yml`**, and
you dispatch it **from `next`** — not from the line. Actions → **"Build and publish new
package versions"** → leave the branch selector on `next` → set `line_branch` to the line
(`lts/5`, `lts/6.1`, …) → type the same value into `confirm_branch` → Run workflow. The job
checks out the line branch itself.

There is no `publish-lts.yml`. It was retired because npm trusted publishing (OIDC) is scoped
per package to the workflow **filename** `publish.yml`; a second publishing file would mean a
second trusted publisher entered by hand on ~300 packages. The line is a **parameter rather
than the ref** for a second reason: the maintained copy of the workflow always runs, so a
release can never execute stale workflow code that was never backported to the line. Picking
an `lts/*` ref in the dialog cannot silently do the wrong thing either — that ref's
`publish.yml` has no `line_branch` input, so GitHub rejects the dispatch outright.

The workflow automates the verified manual sequence: `changeset version` (normal mode —
backported changesets resolve to a patch, or a minor pre-certification in the bootstrap
era) → lockfile refresh → build → `changeset publish --tag lts-<line>` (tag derived from
`line_branch`) → push the release commit + git tag to the line branch → GitHub Release
with `make_latest: false`. It refuses pre-mode leakage, empty changesets, and
prerelease-shaped versions, and asserts afterward that npm `latest` did not move.

**Manual fallback** (if Actions is unavailable — this sequence is dry-check-verified,
process doc §14.1): fresh checkout of the line branch → `npm ci` → `npx changeset version`
→ `npm install` + commit `package-lock.json` → build → `npx changeset publish --tag lts-5`
→ push the version commit and tags to the line branch. (That is `lts/5`'s sequence — the
last npm-era line. On 6.x-era lines the same steps run under pnpm: `pnpm install
--frozen-lockfile`, `pnpm install`, commit `pnpm-lock.yaml`. The workflow auto-detects
the package manager per branch; match it when working by hand.)

Hard rules, either path: line publishes never merge to `main` or back to `next`; `latest`
never moves here; GitHub Releases from a line stay `make_latest: false` until the line is
the newest certified. **Dispatch from `next` and name the line in `line_branch`; never
dispatch from the line ref itself.**

That rule reads the same as the old one but for a different reason, so it is worth stating
plainly: the 2026-08-01 dry-check found the *then-current* `publish.yml` unsafe to dispatch
from a line, because its publish step ran a bare `changeset publish` (no `--tag`, so a line
build would have landed on `latest`) and its `main`-gated steps silently skipped. The
dedicated `publish-lts` job and the dispatch guard fixed exactly that. What survives is the
ref discipline: dispatch the maintained copy, not whatever the line happens to carry.

DB-touching line changes need their §12 label (`metadata-migration`, `codegen-repair`, or
`security-exception`). The line guard that is supposed to enforce this on `lts/*` PRs is
**not built yet** (process doc §15 item 6), so today the label is a review convention and
the human reading the migration diff is the only control. Do not treat a green line PR as
evidence that the labels were checked.

**Release notes for a line release do go live** — this is the one operation where they do,
because the docs site builds the certified line. But they have to *reach* the line branch:
PR `releases/v<version>.md` into `next`, then apply the `backport lts/<line>` label. Notes
that stop at `next` publish nothing.

---

## 4. Certification flip

When the gates pass on a specific line build (say 6.1.2):

1. Update [`release-lines.json`](../release-lines.json): the line becomes `certified`,
   `certifiedBuild: "6.1.2"`; the superseded line moves to its grace state. This PR is the
   sign-off instrument — CODEOWNERS routes it to the cert owner.
2. From a checkout of the certified tag (`v6.1.2`), run `ci/dist-tag-all.mjs` to move npm's
   **`latest`** across all packages, with its post-move assertions.
3. Mark the GitHub Release for 6.1.2 as latest.
4. Commit the scorecard: `certifications/6.1.2.md`, linked from the release.
5. Comms: certification announcement (process doc, Appendix A.3 template).

---

## Recovery: released, but the back-merge did not land

**A red publish run with an open `chore/backmerge-v*` PR is a designed state, not a broken
one.** Read this before touching anything — the instinct to "fix" it by hand is how you end
up with two competing back-merge branches.

`publish.yml` does its last two jobs after the packages are already on npm: merge `main`
back into `next`, and record the release in `release-lines.json`. If the back-merge cannot
be completed, the release itself is **fine** — packages published, tag pushed, GitHub
Release created — and only the merge is outstanding.

Two things cause it, and the workflow responds to both the same way:

| Cause | What it looks like |
|---|---|
| **A real conflict.** `ci/back-merge.mjs` refuses to auto-resolve anything but `pnpm-lock.yaml`, because `next` accumulates hours of merges while a release builds and guessing would silently discard them. | The step log names the conflicting paths. |
| **A rejected push.** `next` is protected; the release App must hold a ruleset bypass, and that is GitHub configuration living outside this repo. | `GH013: Repository rule violations found for refs/heads/next`. |

### What the workflow already did for you

1. Opened **`chore/backmerge-v<version>` → `next`**, carrying `main`'s actual tip with the
   failure output in the PR body. It is idempotent: re-running the job reuses the open PR
   and will not push over a branch you have been resolving conflicts on.
2. Recorded the release in `release-lines.json` anyway — that step is independent and does
   not wait for the back-merge.
3. **Failed the run deliberately.** The release is not complete until the PR merges, and a
   green run would say otherwise.

### What ELSE stopped, that nobody tells you about

`publish.yml` is the trigger for two `workflow_run` workflows, and **both refuse to run when
the triggering run did not conclude `success`** ("Error out if the trigger did not succeed").
So a failed back-merge silently takes them with it:

| Workflow | Consequence of the skip |
|---|---|
| [`docker.yml`](../.github/workflows/docker.yml) | **None during the Edge era.** It skips any prerelease version by design — *"no Docker image for Edge builds, by decision, not by omission."* Nothing to catch up. |
| [`docs.yml`](../.github/workflows/docs.yml) | **Real.** The `/v6/` docs set builds from `main`, which the release DID advance, so the published site silently keeps documenting the previous release. |

When v6.1.0-edge.6 failed this way on 2026-09-11, the docs site stayed on the 2026-09-02
(edge.5) build and nothing surfaced it — the release PR was recovered, the ledger was
recorded, and the stale docs went unnoticed until someone went looking.

**Catching docs up is a manual dispatch:** Actions → *Update package documentation* → Run
workflow (it carries `workflow_dispatch`). Check the last successful run first — if a later
release already deployed, you do not need this.

### What you do

1. Open the PR. Resolve conflicts there and merge it. That is the whole recovery.
2. Dispatch *Update package documentation* to catch up the docs site (see above) — the
   failed run skipped it.
3. If the run is red but there is **no** PR, the fallback itself failed — check its step,
   then finish by hand: `git checkout next && git merge origin/main`.
4. If the run warns *"main is already an ancestor of next — nothing to back-merge"*, the
   merge had in fact landed before the step reported failure. Nothing is outstanding; read
   the back-merge step's log to find out why it failed anyway.

**Do not re-run the publish workflow to fix this.** The packages are already on npm; a
re-run cannot republish them and will not help.

### Preventing the rejected-push case

[`DEPLOYMENT.md`](../DEPLOYMENT.md) Step 0 item 2 runs **Actions → "Verify the release App token"**. It is
read-only, takes under a minute, and reports whether the App's bypass on `next` is still
live. A revoked bypass is invisible until a release is half-done, which is exactly how
v6.1.0-edge.6 went ([#4382](https://github.com/MemberJunction/MJ/pull/4382)).

---

## Safety rails (all operations)

- `latest` moves **only** in operation 4. No build ever publishes to it.
- Plain (unsuffixed) versions exist only at cuts and on lines. The era gate enforces this
  on the routine path; don't fight it.
- `changeset pre enter`/`exit` happen only in operation 2 (and era opens). Nowhere else.
- Lines never merge into `main` or `next`. Fixes flow `next` → line, never the reverse.
- The post-publish `main` → `next` back-merge **aborts rather than auto-resolving** a
  conflict outside `pnpm-lock.yaml`. An abort means the release succeeded and only the
  back-merge is outstanding — **never re-run the release**. `publish.yml` now opens a PR
  for you; see *Recovery: released, but the back-merge did not land* above.
- A green `docs.yml` does **not** mean your docs change shipped. It checks out `lts/5` on
  every trigger but an explicit-`ref` dispatch, so a `main` push rebuilds the LTS site and
  reports success while ignoring the commit that triggered it.
- Every loop in this document is bounded by a human noticing. If a step's verification
  fails, stop — don't improvise past a red check.
