# Release Engineering Runbook

Operator manual for MJ releases. Audience: whoever is pushing the buttons — the release
engineer for routine Edge releases, the certification owner for cuts, line builds, and flips.

- Policy (the *why* and the rules): [`plans/lts-process.md`](../plans/lts-process.md) — canon.
- Concepts for everyone else: [`VERSIONING.md`](../VERSIONING.md).
- Machine-readable release state: [`release-lines.json`](../release-lines.json).

There are four distinct operations. Know which one you're doing before you start:

| Operation | Frequency | Who | Automation today |
|---|---|---|---|
| 1. Routine Edge release | on demand | Release engineer | **One button** (`Release Edge` workflow) |
| 2. LTS candidate cut | per cycle (~bimonthly) | Cert owner | Scripted-manual |
| 3. LTS line patch release | as fixes land on a line | Cert owner | **One button** (`Publish LTS line release` workflow) |
| 4. Certification flip | once per certification | Cert owner | Scripted-manual |

---

## 1. Routine Edge release

One button. Actions → **"Release Edge"** → Run workflow. The button:

1. Resolves **what** to release: a blank `ref` (the normal case) means the current tip of
   `next`; a commit SHA means exactly that commit. Only commits already merged into `next`
   are accepted — a non-ancestor is refused.
2. Guards: the repo is in Edge prerelease mode; there are unapplied changesets; the
   unit-test run **for that exact commit** is green. Any failure stops with a clear error.
3. Merges the resolved commit into `main` (the dispatcher's name and the short SHA go in
   the merge commit).

**You do not need to freeze `next`.** Preparing a release runs for hours
([`DEPLOYMENT.md`](../DEPLOYMENT.md) Steps 0–8) and `next` keeps moving throughout. Pass
the SHA you validated as `ref`, and anything merged afterwards rides the *next* release
rather than shipping unchecked. Leave it blank when the tip is what you validated.

Note the CI guard is **per-commit, not per-branch**: it asks whether `test.yml` passed for
the commit being released, so a green run on a neighbouring commit never satisfies it. A
`no-run` error means `test.yml` never ran for that commit — pick one that has a green run,
or dispatch `test.yml` against it first.

The push to `main` triggers `publish.yml`, which does everything else — this has always
been the automatic half: `changeset version` (pre mode → the next `X.Y.0-edge.N`), the
version-grammar guard, build, `changeset publish --tag edge`, the release commit +
`vX.Y.0-edge.N` tag, a GitHub prerelease (never latest), and the merge of `main` back
into `next` with a lockfile update.

Manual equivalent (identical behavior): open and merge a `next → main` PR yourself.

Verify after either path: `npm view @memberjunction/core dist-tags` — **`edge` moved,
`latest` did not**; the GitHub Release exists, marked prerelease, not latest.

Guard behavior you may hit: `publish.yml` **hard-fails an unsuffixed 6.x version** on this
path. That is the era gate doing its job — a plain version (a candidate) must never ship
through the routine pipeline. Stop and find the cert owner; don't work around it.

Never run `changeset pre enter` or `changeset pre exit` in this operation. Pre-mode state
changes only during era opens and candidate cuts (operation 2).

### Automation status

Decided and built 2026-08-03: both routine tracks are one-button (`release-edge.yml`,
`publish-lts.yml`). A standing changesets "Version Packages" PR (changesets/action) was
considered and passed over — versioning already runs inside `publish.yml` on `main`, so
a merge-trigger button fit the existing pipeline with less rewiring. Revisit only if the
button press itself becomes a bottleneck.

---

## 2. LTS candidate cut (the pre-exit dance)

Trigger: the cert owner declares the stream ready — "current `6.1.0-edge.N` is our candidate."
The cut happens at the **tip of `next`**. It takes minutes and freezes nothing.

Worked example — cutting line 6.1 while `next` streams `6.1.0-edge.12`:

1. **Announce** the cut moment (a courtesy, not a freeze; merges after it simply ride the
   next stream).
2. On up-to-date `next`: `npx changeset pre exit` → commit.
3. `npx changeset version` — accumulated changesets resolve; the repo versions to plain
   **`6.1.0`**. `pnpm install`, commit `pnpm-lock.yaml`.
4. Push to `next`; tag the version commit **`v6.1.0`** and push the tag.
5. **Branch `lts/6.1` from that tag** and push the branch. This is the candidate's home.
6. **Publish 6.1.0 from the line branch** (operation 3's mechanics) — npm tag **`lts-6.1`**,
   GitHub Release with `make_latest: false`. It must NOT go through `next → main`; the era
   gate will (correctly) refuse it there.
7. Back on `next`, immediately: `npx changeset pre enter edge` + commit, then seed the next
   stream with a minor changeset ("open the 6.2 stream"). The next routine release is
   `6.2.0-edge.0`.
8. Open the certification tracking issue; gates run against 6.1.0 **on `lts/6.1`**.
9. Cert fixes: land on `next` first → label `backport lts/6.1` → bot cherry-picks → line
   patch builds (6.1.1, 6.1.2, …). Certification names whichever build passes.

Pinning an *older* edge build instead of the tip is possible (branch at that exact commit,
run steps 2–3 on the branch) but leaves `next`'s stream tuple stale — it then needs its own
exit/version/re-enter dance. Avoid; cut the tip.

---

## 3. LTS line patch release

One button. Actions → **"Publish LTS line release"** → pick the **line branch** (`lts/5`,
`lts/6.1`, …) in the branch selector → type the same branch name in the confirmation box →
Run workflow. The confirmation exists because the branch picker defaults to `next`, and
this workflow must never run there (it refuses, but don't rely on the refusal).

The workflow automates the verified manual sequence: `changeset version` (normal mode —
backported changesets resolve to a patch, or a minor pre-certification in the bootstrap
era) → lockfile refresh → build → `changeset publish --tag lts-<line>` (tag derived from
the branch name) → push the release commit + git tag to the line branch → GitHub Release
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
the newest certified. **Do not `workflow_dispatch` the routine `publish.yml` from a line
branch** — verified unsafe (dry-check 2026-08-01): its publish step would land on `latest`
and its main-gated steps silently skip.

DB-touching line changes need their §12 label (`metadata-migration`, `codegen-repair`, or
`security-exception`) — the line guard enforces this on `lts/*` PRs.

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
- Green-CI guards are **per-commit**. If a guard ever reads "the branch's latest run"
  instead of this commit's, it can be satisfied by a different tree than the one shipping.
- The post-publish `main` → `next` back-merge **aborts rather than auto-resolving** a
  conflict outside `pnpm-lock.yaml`. An abort means the release succeeded and only the
  back-merge is outstanding — finish it by hand, don't re-run the release.
- Every loop in this document is bounded by a human noticing. If a step's verification
  fails, stop — don't improvise past a red check.
