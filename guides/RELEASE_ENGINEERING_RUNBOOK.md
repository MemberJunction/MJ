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
The cut happens at the **tip of `next`**. It is one workflow dispatch, takes about as long as
an Edge release, and freezes nothing: merges after it simply ride the next stream.

Actions -> "Build and publish new package versions" -> Run workflow -> leave the ref at
`next` -> `cut_line: 6.1` -> `confirm_branch: lts/6.1`. That is invocation 4 in
`publish.yml`; the job is `cut-candidate`, the logic is `ci/candidate-cut.mjs`.

**Before you press it** (the job checks all three and refuses otherwise):

1. `release-lines.json` on `next` carries `lines["6.1"]` as `{ "status": "candidate",
   "candidateDate": "YYYY-MM-DD" }`. That is a reviewed PR (CODEOWNERS: the cert owner);
   status fields never arrive by direct push, so the job only appends the mechanical
   `newest` and `releases` fields afterwards.
2. The newest Edge build is published. The job cuts the tip regardless and only reports
   how many commits sit between the last Edge tag and the tip; a large unpublished batch is
   your call, not its.
3. Nothing named `lts/6.1`, `v6.1.0` or `@memberjunction/core@6.1.0` exists yet.

Also, once per repo and not something the job can do: an admin creates a ruleset for
`lts/**` (pull request required, no force-push, no deletion). `lts/5` was found unprotected
on 2026-09-03; a line born without the ruleset stays that way until someone notices.

**What the job does**, in an order where nothing is pushed until the packages are on npm:

1. Preflight (above), then `changeset pre exit`, `changeset version` (accumulated
   changesets resolve; every `@memberjunction/*` package versions to plain **`6.1.0`**),
   `pnpm install` and a lockfile commit, and a frozen install as the proof the lockfile is
   in sync. All local commits so far.
2. Build, then `changeset publish --tag lts-6.1`. Verified against the registry:
   `lts-6.1` points at 6.1.0 and `latest` did not move.
3. Commit the post-release generated files, tag **`v6.1.0`**.
4. `changeset pre enter edge` plus the seed changeset (`.changeset/open-6-2-edge-stream.md`,
   a `minor`), so the next routine release is `6.2.0-edge.0`. Without the seed a patch-only
   merge would version Edge to `6.1.1-edge.0`, which the line's own first patch owns; this
   was reproduced on a scratch clone, so the seed is load-bearing, not a courtesy.
5. Push `next` (merging in anything that landed during the build, bounded retries; only the
   lockfile may auto-resolve), push the tag, create **`lts/6.1`** at the tag, create the
   GitHub Release with `--latest=false`, append `lines["6.1"].newest` and
   `releases["6.1.0"]` to the ledger, dispatch docs and release notes.

**If it fails.** Before the publish step: `next`, npm and GitHub are untouched, re-dispatch.
After it: the packages are on npm and the run stops red at the first step it could not
complete. That is "released, not yet recorded", the same posture as every other release path
here; finish the remaining steps by hand from the run log, do not re-run.

**Afterwards.** Open the certification tracking issue; gates run against 6.1.0 **on
`lts/6.1`**. Cert fixes land on `next` first -> label `backport lts/6.1` -> bot cherry-picks
-> line patch builds (6.1.1, 6.1.2, ...) via operation 3. Certification names whichever
build passes.

Pinning an *older* Edge build instead of the tip is not something the job supports, on
purpose: it would leave `next`'s stream tuple stale and need its own exit/version/re-enter
dance. Cut the tip.

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

## Safety rails (all operations)

- `latest` moves **only** in operation 4. No build ever publishes to it.
- Plain (unsuffixed) versions exist only at cuts and on lines. The era gate enforces this
  on the routine path; don't fight it.
- `changeset pre enter`/`exit` happen only in operation 2 (and era opens). Nowhere else.
- Lines never merge into `main` or `next`. Fixes flow `next` → line, never the reverse.
- The post-publish `main` → `next` back-merge **aborts rather than auto-resolving** a
  conflict outside `pnpm-lock.yaml`. An abort means the release succeeded and only the
  back-merge is outstanding — finish it by hand, don't re-run the release.
- A green `docs.yml` does **not** mean your docs change shipped. It checks out `lts/5` on
  every trigger but an explicit-`ref` dispatch, so a `main` push rebuilds the LTS site and
  reports success while ignoring the commit that triggered it.
- Every loop in this document is bounded by a human noticing. If a step's verification
  fails, stop — don't improvise past a red check.
